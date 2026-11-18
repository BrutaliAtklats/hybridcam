use serde::Serialize;
use std::collections::VecDeque;
use std::ffi::c_void;
use std::ptr::null_mut;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

#[cfg(windows)]
#[repr(C)]
struct Dcb {
    dcb_length: u32,
    baud_rate: u32,
    flags: u32,
    w_reserved: u16,
    xon_lim: u16,
    xoff_lim: u16,
    byte_size: u8,
    parity: u8,
    stop_bits: u8,
    xon_char: i8,
    xoff_char: i8,
    error_char: i8,
    eof_char: i8,
    evt_char: i8,
    w_reserved1: u16,
}

#[cfg(windows)]
#[repr(C)]
struct CommTimeouts {
    read_interval_timeout: u32,
    read_total_timeout_multiplier: u32,
    read_total_timeout_constant: u32,
    write_total_timeout_multiplier: u32,
    write_total_timeout_constant: u32,
}

#[cfg(windows)]
#[link(name = "kernel32")]
extern "system" {
    fn QueryDosDeviceW(lp_device_name: *const u16, lp_target_path: *mut u16, ucch_max: u32) -> u32;
    fn CreateFileW(
        lp_file_name: *const u16,
        dw_desired_access: u32,
        dw_share_mode: u32,
        lp_security_attributes: *mut c_void,
        dw_creation_disposition: u32,
        dw_flags_and_attributes: u32,
        h_template_file: *mut c_void,
    ) -> *mut c_void;
    fn GetCommState(h_file: *mut c_void, lp_dcb: *mut Dcb) -> i32;
    fn SetCommState(h_file: *mut c_void, lp_dcb: *mut Dcb) -> i32;
    fn SetCommTimeouts(h_file: *mut c_void, lp_comm_timeouts: *mut CommTimeouts) -> i32;
    fn PurgeComm(h_file: *mut c_void, dw_flags: u32) -> i32;
    fn ReadFile(
        h_file: *mut c_void,
        lp_buffer: *mut u8,
        n_number_of_bytes_to_read: u32,
        lp_number_of_bytes_read: *mut u32,
        lp_overlapped: *mut c_void,
    ) -> i32;
    fn WriteFile(
        h_file: *mut c_void,
        lp_buffer: *const u8,
        n_number_of_bytes_to_write: u32,
        lp_number_of_bytes_written: *mut u32,
        lp_overlapped: *mut c_void,
    ) -> i32;
    fn CloseHandle(h_object: *mut c_void) -> i32;
}

const INVALID_HANDLE_VALUE: *mut c_void = (-1isize) as *mut c_void;
const GENERIC_READ: u32 = 0x8000_0000;
const GENERIC_WRITE: u32 = 0x4000_0000;
const OPEN_EXISTING: u32 = 3;

#[derive(Debug, Clone, Serialize)]
pub struct CncStatusSnapshot {
    pub connected: bool,
    pub port: String,
    pub state: String,
    pub mpos: [f64; 3],
    pub wpos: [f64; 3],
    pub feed_ovr: u32,
    pub spindle_ovr: u32,
    pub streaming: bool,
    pub paused: bool,
    pub stream_index: usize,
    pub stream_total: usize,
    pub logs: Vec<String>,
}

struct SerialInner {
    connected: bool,
    port: String,
    state: String,
    mpos: [f64; 3],
    wpos: [f64; 3],
    wco: [f64; 3],
    feed_ovr: u32,
    spindle_ovr: u32,
    tx_queue: VecDeque<Vec<u8>>,
    stream_lines: Vec<String>,
    stream_index: usize,
    streaming: bool,
    paused: bool,
    waiting_ack: bool,
    disconnect_req: bool,
    logs: VecDeque<String>,
}

impl Default for SerialInner {
    fn default() -> Self {
        Self {
            connected: false,
            port: String::new(),
            state: "Disconnected".to_string(),
            mpos: [0.0; 3],
            wpos: [0.0; 3],
            wco: [0.0; 3],
            feed_ovr: 100,
            spindle_ovr: 100,
            tx_queue: VecDeque::new(),
            stream_lines: Vec::new(),
            stream_index: 0,
            streaming: false,
            paused: false,
            waiting_ack: false,
            disconnect_req: false,
            logs: VecDeque::with_capacity(120),
        }
    }
}

impl SerialInner {
    fn push_log(&mut self, msg: String) {
        if self.logs.len() >= 100 {
            self.logs.pop_front();
        }
        self.logs.push_back(msg);
    }

    fn parse_line(&mut self, line: &str) {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            return;
        }
        if trimmed.starts_with('<') && trimmed.ends_with('>') {
            let inner = &trimmed[1..trimmed.len() - 1];
            let parts: Vec<&str> = inner.split('|').collect();
            if let Some(st) = parts.first() {
                self.state = st.split(':').next().unwrap_or("Idle").to_string();
                self.paused = self.state.eq_ignore_ascii_case("Hold");
            }
            for part in parts.iter().skip(1) {
                if let Some(rest) = part.strip_prefix("MPos:") {
                    let nums: Vec<f64> = rest.split(',').filter_map(|s| s.parse().ok()).collect();
                    if nums.len() >= 3 {
                        self.mpos = [nums[0], nums[1], nums[2]];
                        self.wpos = [
                            nums[0] - self.wco[0],
                            nums[1] - self.wco[1],
                            nums[2] - self.wco[2],
                        ];
                    }
                } else if let Some(rest) = part.strip_prefix("WPos:") {
                    let nums: Vec<f64> = rest.split(',').filter_map(|s| s.parse().ok()).collect();
                    if nums.len() >= 3 {
                        self.wpos = [nums[0], nums[1], nums[2]];
                        self.mpos = [
                            nums[0] + self.wco[0],
                            nums[1] + self.wco[1],
                            nums[2] + self.wco[2],
                        ];
                    }
                } else if let Some(rest) = part.strip_prefix("WCO:") {
                    let nums: Vec<f64> = rest.split(',').filter_map(|s| s.parse().ok()).collect();
                    if nums.len() >= 3 {
                        self.wco = [nums[0], nums[1], nums[2]];
                        self.wpos = [
                            self.mpos[0] - self.wco[0],
                            self.mpos[1] - self.wco[1],
                            self.mpos[2] - self.wco[2],
                        ];
                    }
                } else if let Some(rest) = part.strip_prefix("Ov:") {
                    let nums: Vec<u32> = rest.split(',').filter_map(|s| s.parse().ok()).collect();
                    if nums.len() >= 3 {
                        self.feed_ovr = nums[0];
                        self.spindle_ovr = nums[2];
                    }
                }
            }
            return;
        }

        if trimmed.eq_ignore_ascii_case("ok") || trimmed.starts_with("ok ") {
            self.waiting_ack = false;
            return;
        }

        if trimmed.to_lowercase().starts_with("error:") || trimmed.to_lowercase().starts_with("alarm:") {
            self.waiting_ack = false;
            self.push_log(format!("<< {trimmed}"));
            if trimmed.to_lowercase().starts_with("alarm:") {
                self.streaming = false;
                self.state = "Alarm".to_string();
            }
            return;
        }

        self.push_log(format!("<< {trimmed}"));
    }
}

static CNC_STATE: OnceLock<Arc<Mutex<SerialInner>>> = OnceLock::new();

fn state_arc() -> Arc<Mutex<SerialInner>> {
    CNC_STATE
        .get_or_init(|| Arc::new(Mutex::new(SerialInner::default())))
        .clone()
}

#[cfg(windows)]
fn open_windows_serial(port: &str, baud: u32) -> Result<*mut c_void, String> {
    let dev = format!("\\\\.\\{port}");
    let wide: Vec<u16> = dev.encode_utf16().chain(std::iter::once(0)).collect();
    let handle = unsafe {
        CreateFileW(
            wide.as_ptr(),
            GENERIC_READ | GENERIC_WRITE,
            0,
            null_mut(),
            OPEN_EXISTING,
            0,
            null_mut(),
        )
    };
    if handle == INVALID_HANDLE_VALUE || handle.is_null() {
        return Err(format!("Failed to open {port} (check cable & that no other sender is connected)"));
    }

    let mut dcb: Dcb = unsafe { std::mem::zeroed() };
    dcb.dcb_length = std::mem::size_of::<Dcb>() as u32;
    if unsafe { GetCommState(handle, &mut dcb) } == 0 {
        unsafe { CloseHandle(handle) };
        return Err("GetCommState failed".to_string());
    }
    dcb.baud_rate = baud;
    dcb.byte_size = 8;
    dcb.parity = 0; // NOPARITY
    dcb.stop_bits = 0; // ONESTOPBIT
    // fBinary = 1, fDtrControl = 1 (ENABLE)
    dcb.flags = (dcb.flags & !0x0030) | 0x0001 | 0x0010;
    if unsafe { SetCommState(handle, &mut dcb) } == 0 {
        unsafe { CloseHandle(handle) };
        return Err("SetCommState failed".to_string());
    }

    let mut timeouts = CommTimeouts {
        read_interval_timeout: 5,
        read_total_timeout_multiplier: 0,
        read_total_timeout_constant: 15,
        write_total_timeout_multiplier: 0,
        write_total_timeout_constant: 200,
    };
    unsafe {
        SetCommTimeouts(handle, &mut timeouts);
        PurgeComm(handle, 0x000F);
    }
    Ok(handle)
}

#[tauri::command]
pub fn list_serial_ports_ipc() -> Vec<String> {
    #[cfg(windows)]
    {
        let mut buf = vec![0u16; 65536];
        let len = unsafe { QueryDosDeviceW(null_mut(), buf.as_mut_ptr(), buf.len() as u32) };
        if len == 0 {
            return Vec::new();
        }
        let slice = &buf[..(len as usize).min(buf.len())];
        let mut ports: Vec<String> = slice
            .split(|&c| c == 0)
            .filter_map(|part| {
                if part.is_empty() {
                    return None;
                }
                let s = String::from_utf16_lossy(part);
                if let Some(num) = s.strip_prefix("COM") {
                    if !num.is_empty() && num.chars().all(|c| c.is_ascii_digit()) {
                        return Some(s);
                    }
                }
                None
            })
            .collect();
        ports.sort_by_key(|p| p.strip_prefix("COM").and_then(|n| n.parse::<u32>().ok()).unwrap_or(999));
        ports
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

#[tauri::command]
pub fn connect_serial_ipc(port: String, baud: u32) -> Result<(), String> {
    #[cfg(not(windows))]
    {
        let _ = (port, baud);
        return Err("Serial sender is only supported on Windows".to_string());
    }

    #[cfg(windows)]
    {
        let arc = state_arc();
        {
            let guard = arc.lock().map_err(|e| e.to_string())?;
            if guard.connected {
                return Err(format!("Already connected to {}", guard.port));
            }
        }

        let handle = open_windows_serial(&port, baud)? as usize;
        {
            let mut guard = arc.lock().map_err(|e| e.to_string())?;
            *guard = SerialInner::default();
            guard.connected = true;
            guard.port = port.clone();
            guard.state = "Idle".to_string();
            guard.push_log(format!("Connected to {port} @ {baud} baud"));
            // Wake GRBL with a soft newline + status query
            guard.tx_queue.push_back(b"\r\n?".to_vec());
        }

        std::thread::spawn(move || {
            let h = handle as *mut c_void;
            let mut rx_buf = [0u8; 512];
            let mut line_acc = String::new();
            let mut last_poll = Instant::now();

            loop {
                let mut to_write: Vec<Vec<u8>> = Vec::new();
                let mut should_exit = false;
                {
                    if let Ok(mut guard) = arc.lock() {
                        if guard.disconnect_req {
                            should_exit = true;
                        } else {
                            while let Some(pkt) = guard.tx_queue.pop_front() {
                                to_write.push(pkt);
                            }
                            if guard.streaming
                                && !guard.paused
                                && !guard.waiting_ack
                                && guard.stream_index < guard.stream_lines.len()
                            {
                                let next_line = guard.stream_lines[guard.stream_index].clone();
                                guard.stream_index += 1;
                                guard.waiting_ack = true;
                                to_write.push(format!("{next_line}\n").into_bytes());
                            } else if guard.streaming
                                && !guard.waiting_ack
                                && guard.stream_index >= guard.stream_lines.len()
                            {
                                guard.streaming = false;
                                guard.push_log("Job streaming complete.".to_string());
                            }
                        }
                    }
                }

                if should_exit {
                    break;
                }

                if last_poll.elapsed() >= Duration::from_millis(220) {
                    to_write.push(b"?".to_vec());
                    last_poll = Instant::now();
                }

                for pkt in to_write {
                    let mut written: u32 = 0;
                    unsafe {
                        WriteFile(h, pkt.as_ptr(), pkt.len() as u32, &mut written, null_mut());
                    }
                }

                let mut read_len: u32 = 0;
                let ok = unsafe { ReadFile(h, rx_buf.as_mut_ptr(), rx_buf.len() as u32, &mut read_len, null_mut()) };
                if ok != 0 && read_len > 0 {
                    let chunk = String::from_utf8_lossy(&rx_buf[..read_len as usize]);
                    line_acc.push_str(&chunk);
                    while let Some(pos) = line_acc.find('\n') {
                        let full_line = line_acc[..pos].trim_end_matches('\r').to_string();
                        line_acc.drain(..=pos);
                        if let Ok(mut guard) = arc.lock() {
                            guard.parse_line(&full_line);
                        }
                    }
                } else {
                    std::thread::sleep(Duration::from_millis(12));
                }
            }

            unsafe { CloseHandle(h) };
            if let Ok(mut guard) = arc.lock() {
                guard.connected = false;
                guard.streaming = false;
                guard.state = "Disconnected".to_string();
                guard.push_log("Disconnected.".to_string());
            }
        });

        Ok(())
    }
}

#[tauri::command]
pub fn disconnect_serial_ipc() -> Result<(), String> {
    let arc = state_arc();
    let mut guard = arc.lock().map_err(|e| e.to_string())?;
    guard.disconnect_req = true;
    guard.streaming = false;
    Ok(())
}

#[tauri::command]
pub fn send_serial_line_ipc(line: String) -> Result<(), String> {
    let arc = state_arc();
    let mut guard = arc.lock().map_err(|e| e.to_string())?;
    if !guard.connected {
        return Err("Not connected to CNC controller".to_string());
    }
    let clean = line.trim();
    if !clean.is_empty() {
        guard.push_log(format!(">> {clean}"));
        guard.tx_queue.push_back(format!("{clean}\n").into_bytes());
    }
    Ok(())
}

#[tauri::command]
pub fn send_realtime_byte_ipc(byte: u8) -> Result<(), String> {
    let arc = state_arc();
    let mut guard = arc.lock().map_err(|e| e.to_string())?;
    if !guard.connected {
        return Err("Not connected to CNC controller".to_string());
    }
    if byte == b'!' {
        guard.paused = true;
    } else if byte == b'~' {
        guard.paused = false;
    } else if byte == 0x18 {
        guard.streaming = false;
        guard.waiting_ack = false;
        guard.paused = false;
    }
    guard.tx_queue.push_back(vec![byte]);
    Ok(())
}

#[tauri::command]
pub fn start_gcode_stream_ipc(lines: Vec<String>) -> Result<(), String> {
    let arc = state_arc();
    let mut guard = arc.lock().map_err(|e| e.to_string())?;
    if !guard.connected {
        return Err("Connect to your CNC controller first".to_string());
    }
    let filtered: Vec<String> = lines
        .into_iter()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty() && !l.starts_with('(') && !l.starts_with(';'))
        .collect();
    if filtered.is_empty() {
        return Err("No G-code lines to stream".to_string());
    }
    guard.push_log(format!("Starting job ({} lines)...", filtered.len()));
    guard.stream_lines = filtered;
    guard.stream_index = 0;
    guard.waiting_ack = false;
    guard.paused = false;
    guard.streaming = true;
    Ok(())
}

#[tauri::command]
pub fn stop_gcode_stream_ipc() -> Result<(), String> {
    let arc = state_arc();
    let mut guard = arc.lock().map_err(|e| e.to_string())?;
    guard.streaming = false;
    guard.waiting_ack = false;
    guard.paused = false;
    guard.tx_queue.push_back(vec![b'!', 0x18]);
    guard.push_log("Job aborted (Feed Hold + Soft Reset).".to_string());
    Ok(())
}

#[tauri::command]
pub fn get_cnc_status_ipc() -> CncStatusSnapshot {
    let arc = state_arc();
    let guard = arc.lock().unwrap();
    CncStatusSnapshot {
        connected: guard.connected,
        port: guard.port.clone(),
        state: guard.state.clone(),
        mpos: guard.mpos,
        wpos: guard.wpos,
        feed_ovr: guard.feed_ovr,
        spindle_ovr: guard.spindle_ovr,
        streaming: guard.streaming,
        paused: guard.paused,
        stream_index: guard.stream_index,
        stream_total: guard.stream_lines.len(),
        logs: guard.logs.iter().cloned().collect(),
    }
}
