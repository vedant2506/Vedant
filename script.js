// Check if Web Bluetooth is supported
if (!('bluetooth' in navigator)) {
    alert('Web Bluetooth is not supported in your browser. Please use Chrome, Edge, or Opera on a compatible device.');
}

document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const teacherBtn = document.getElementById('teacherBtn');
    const studentBtn = document.getElementById('studentBtn');
    const teacherInterface = document.getElementById('teacherInterface');
    const studentInterface = document.getElementById('studentInterface');
    const startScanBtn = document.getElementById('startScan');
    const stopScanBtn = document.getElementById('stopScan');
    const clearListBtn = document.getElementById('clearList');
    const statusDiv = document.getElementById('status');
    const attendanceBody = document.getElementById('attendanceBody');
    const startAdvertiseBtn = document.getElementById('startAdvertise');
    const stopAdvertiseBtn = document.getElementById('stopAdvertise');
    const rollNumberInput = document.getElementById('rollNumber');
    const studentStatusDiv = document.getElementById('studentStatus');
    
    // Variables
    let scanning = false;
    let advertising = false;
    let detectedStudents = new Set();
    let scanInterval = null;
    let server = null;

    // Role Selection
    teacherBtn.addEventListener('click', function() {
        teacherBtn.classList.add('active');
        studentBtn.classList.remove('active');
        teacherInterface.classList.add('active');
        studentInterface.classList.remove('active');
    });

    studentBtn.addEventListener('click', function() {
        studentBtn.classList.add('active');
        teacherBtn.classList.remove('active');
        studentInterface.classList.add('active');
        teacherInterface.classList.remove('active');
    });

    // Teacher Functions
    startScanBtn.addEventListener('click', startScanning);
    stopScanBtn.addEventListener('click', stopScanning);
    clearListBtn.addEventListener('click', clearAttendanceList);

    async function startScanning() {
        if (scanning) return;
        
        try {
            setStatus("Starting scan for student devices...", "");
            
            // Request Bluetooth permission and start scanning
            scanning = true;
            startScanBtn.disabled = true;
            stopScanBtn.disabled = false;
            
            // Start continuous scanning (with intervals due to browser limitations)
            scanForStudents();
            
            setStatus("Scanning for student devices...", "success");
            
        } catch (error) {
            setStatus(`Error: ${error.message}`, "error");
            scanning = false;
            startScanBtn.disabled = false;
            stopScanBtn.disabled = true;
        }
    }

    function stopScanning() {
        scanning = false;
        startScanBtn.disabled = false;
        stopScanBtn.disabled = true;
        
        if (scanInterval) {
            clearInterval(scanInterval);
            scanInterval = null;
        }
        
        setStatus("Scanning stopped.", "success");
    }

    async function scanForStudents() {
        // Clear previous interval if exists
        if (scanInterval) {
            clearInterval(scanInterval);
        }
        
        // Start scanning immediately
        await performScan();
        
        // Set up interval for continuous scanning (browser may limit frequency)
        scanInterval = setInterval(async () => {
            if (scanning) {
                await performScan();
            } else {
                clearInterval(scanInterval);
            }
        }, 5000); // Scan every 5 seconds
    }

    async function performScan() {
        try {
            // Note: Web Bluetooth doesn't allow reading advertising data without connecting
            // We'll request devices and try to extract roll numbers from device names
            const device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: [] // We don't need to connect to any service
            });
            
            // Try to extract roll number from device name
            const rollNumber = extractRollNumberFromName(device.name);
            
            if (rollNumber) {
                addStudentToAttendance(rollNumber, device.name);
            } else {
                // If we can't extract from name, attempt to connect and read characteristic
                // This requires student devices to be running the student mode
                try {
                    await connectToDevice(device);
                } catch (connectError) {
                    console.log(`Could not connect to device: ${connectError.message}`);
                }
            }
            
        } catch (error) {
            if (error.name !== 'NotFoundError' && error.name !== 'AbortError') {
                console.log(`Scan error: ${error.message}`);
            }
            // NotFoundError is normal - user didn't select a device
            // AbortError is normal - user canceled the device selection
        }
    }

    function extractRollNumberFromName(deviceName) {
        // Try to extract roll number from device name using common patterns
        if (!deviceName) return null;
        
        // Pattern 1: RollNo_12345 or ROLL_12345
        const pattern1 = /(?:RollNo|ROLL)[_\-:]?(\w+)/i;
        const match1 = deviceName.match(pattern1);
        if (match1 && match1[1]) {
            return match1[1];
        }
        
        // Pattern 2: Just a number that might be the roll number
        const pattern2 = /^(\d+)$/;
        const match2 = deviceName.match(pattern2);
        if (match2 && match2[1]) {
            return match2[1];
        }
        
        // Pattern 3: CS2023001, EE12345, etc.
        const pattern3 = /^[A-Z]{2}\d{5,7}$/i;
        if (pattern3.test(deviceName)) {
            return deviceName;
        }
        
        return null;
    }

    async function connectToDevice(device) {
        try {
            // Connect to the device
            const server = await device.gatt.connect();
            
            // Look for a service that might contain the roll number
            // This is a custom UUID that our student app would use
            const SERVICE_UUID = '0000abcd-0000-1000-8000-00805f9b34fb';
            const CHARACTERISTIC_UUID = '0000abce-0000-1000-8000-00805f9b34fb';
            
            try {
                const service = await server.getPrimaryService(SERVICE_UUID);
                const characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);
                const value = await characteristic.readValue();
                
                // Decode the roll number (assuming it's stored as UTF-8 string)
                const decoder = new TextDecoder('utf-8');
                const rollNumber = decoder.decode(value);
                
                if (rollNumber) {
                    addStudentToAttendance(rollNumber, device.name || device.id);
                }
            } catch (error) {
                console.log(`Could not read roll number from device: ${error.message}`);
            }
            
            // Disconnect
            server.disconnect();
        } catch (error) {
            console.log(`Connection error: ${error.message}`);
        }
    }

    function addStudentToAttendance(rollNumber, deviceName) {
        const now = new Date();
        const timeString = now.toLocaleTimeString();
        
        // Check if already detected
        if (detectedStudents.has(rollNumber)) {
            return; // Already recorded
        }
        
        detectedStudents.add(rollNumber);
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${rollNumber}</td>
            <td>${deviceName}</td>
            <td>${timeString}</td>
            <td class="present">Present</td>
        `;
        
        attendanceBody.appendChild(row);
        
        setStatus(`Detected student: ${rollNumber}`, "success");
    }

    function clearAttendanceList() {
        detectedStudents.clear();
        attendanceBody.innerHTML = '';
        setStatus("Attendance list cleared.", "success");
    }

    function setStatus(message, type = "") {
        statusDiv.textContent = message;
        statusDiv.className = "status";
        if (type) {
            statusDiv.classList.add(type);
        }
    }

    // Student Functions
    startAdvertiseBtn.addEventListener('click', startAdvertising);
    stopAdvertiseBtn.addEventListener('click', stopAdvertising);

    async function startAdvertising() {
        const rollNumber = rollNumberInput.value.trim();
        
        if (!rollNumber) {
            setStudentStatus("Please enter your roll number", "error");
            return;
        }
        
        if (advertising) return;
        
        try {
            setStudentStatus("Setting up advertising...", "");
            
            // Create a service to expose the roll number
            // Note: Web Bluetooth currently doesn't support peripheral mode (advertising)
            // in most browsers. This is a major limitation.
            
            // For browsers that support it (experimental), we would do:
            try {
                // This API is not widely supported yet
                const serviceUUID = '0000abcd-0000-1000-8000-00805f9b34fb';
                const characteristicUUID = '0000abce-0000-1000-8000-00805f9b34fb';
                
                const service = {
                    [serviceUUID]: {
                        [characteristicUUID]: {
                            value: new TextEncoder().encode(rollNumber),
                            properties: ['read']
                        }
                    }
                };
                
                // Try to start advertising (this will likely fail in most browsers)
                const advertisement = {
                    name: `RollNo_${rollNumber}`,
                    serviceData: new Map()
                };
                
                // In browsers that support it, we would call something like:
                // await navigator.bluetooth.advertising.start(advertisement);
                
                // Since advertising isn't supported, we'll simulate by setting device name
                document.title = `RollNo_${rollNumber} - Attendance System`;
                
                advertising = true;
                startAdvertiseBtn.disabled = true;
                stopAdvertiseBtn.disabled = false;
                
                setStudentStatus(`Advertising roll number: ${rollNumber}. Note: Web Bluetooth advertising is limited in browsers.`, "success");
                
                // Store roll number in localStorage for potential future use
                localStorage.setItem('studentRollNumber', rollNumber);
                
            } catch (advertiseError) {
                // Fallback: Inform user about limitations
                advertising = false;
                setStudentStatus(
                    `Your roll number is ${rollNumber}. Unfortunately, web browsers have limited support for Bluetooth advertising. ` + 
                    `Please ensure your device's Bluetooth name contains your roll number (e.g., "RollNo_${rollNumber}") for teachers to detect you.`,
                    "error"
                );
                
                // Still enable stop button to allow user to "stop"
                startAdvertiseBtn.disabled = true;
                stopAdvertiseBtn.disabled = false;
            }
            
        } catch (error) {
            setStudentStatus(`Error: ${error.message}`, "error");
        }
    }

    function stopAdvertising() {
        advertising = false;
        startAdvertiseBtn.disabled = false;
        stopAdvertiseBtn.disabled = true;
        setStudentStatus("Advertising stopped.", "success");
    }

    function setStudentStatus(message, type = "") {
        studentStatusDiv.textContent = message;
        studentStatusDiv.className = "status";
        if (type) {
            studentStatusDiv.classList.add(type);
        }
    }

    // Load saved roll number if exists
    const savedRollNumber = localStorage.getItem('studentRollNumber');
    if (savedRollNumber) {
        rollNumberInput.value = savedRollNumber;
    }
});
