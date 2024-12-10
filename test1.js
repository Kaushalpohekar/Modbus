const axios = require('axios');
const Modbus = require('jsmodbus');
const net = require('net');
const mqtt = require('mqtt');

// MQTT Client Setup
const mqttClient = mqtt.connect('mqtt://broker.emqx.io:1883'); // Change to your MQTT broker URL
mqttClient.on('connect', () => {
    console.log('Connected to MQTT broker');
});

mqttClient.on('error', (err) => {
    console.error('MQTT Error:', err.message);
});

// Fetch gauge data from the URL
async function fetchGaugeData(url) {
    try {
        const response = await axios.get(url);
        return response.data.data;
    } catch (err) {
        console.error('Error fetching gauge data:', err.message);
        return [];
    }
}

// Convert two 16-bit registers to different data types (same as before)
function convertToLong(registers, order = 'msb_first') {
    let longValue;
    if (order === 'msb_first') {
        longValue = (registers[0] << 16) + registers[1];
    } else if (order === 'lsb_first') {
        longValue = (registers[1] << 16) + registers[0];
    }
    return longValue;
}

function convertToSignedInt(registers, order = 'msb_first') {
    let longValue = convertToLong(registers, order);
    if (longValue > 0x7FFFFFFF) {
        longValue -= 0x100000000;
    }
    return longValue;
}

function convertToFloat(registers, order = 'msb_first') {
    let longValue = convertToLong(registers, order);
    let buffer = Buffer.alloc(4);
    buffer.writeUInt32BE(longValue, 0);
    return buffer.readFloatBE(0);
}

function convertToDouble(registers, order = 'msb_first') {
    let longValue = convertToLong(registers, order);
    let buffer = Buffer.alloc(8);
    buffer.writeUInt32BE(longValue, 0);
    return buffer.readDoubleBE(0);
}

function convertToHex(registers, order = 'msb_first') {
    let longValue = convertToLong(registers, order);
    return '0x' + longValue.toString(16).toUpperCase();
}

function convertToBinary(registers, order = 'msb_first') {
    let longValue = convertToLong(registers, order);
    return '0b' + longValue.toString(2);
}

// Read Modbus Data and Publish to MQTT
async function readModbusData(config) {
    const { host, port, registerType, registerAddress, dataType, byteOrder, speed, count, gaugeId, charId } = config;
    
    const socket = new net.Socket();
    const client = new Modbus.client.TCP(socket);
    
    socket.connect({ host, port }, async () => {
        console.log(`Connected to Modbus Server at ${host}:${port}`);
        
        try {
            const response = await client[registerType](registerAddress - 40001, count);
            
            let value;
            
            if (dataType === 'unsigned_int') {
                value = convertToLong(response.response.body.valuesAsArray, byteOrder);
            } else if (dataType === 'signed_int') {
                value = convertToSignedInt(response.response.body.valuesAsArray, byteOrder);
            } else if (dataType === 'float') {
                value = convertToFloat(response.response.body.valuesAsArray, byteOrder);
            } else if (dataType === 'double') {
                value = convertToDouble(response.response.body.valuesAsArray, byteOrder);
            } else if (dataType === 'hex') {
                value = convertToHex(response.response.body.valuesAsArray, byteOrder);
            } else if (dataType === 'binary') {
                value = convertToBinary(response.response.body.valuesAsArray, byteOrder);
            }

            // Publish to MQTT with the topic format gauge/gauge_id/char_id
            const topic = `gauge/${gaugeId}/${charId}`;
            mqttClient.publish(topic, JSON.stringify({ gaugeId, charId, value }), { qos: 1 });
            console.log(`Published to MQTT on topic: ${topic}, Value: ${value}`);
        } catch (err) {
            console.error('Error reading Modbus data:', err.message);
        }
    });

    socket.on('error', (err) => {
        console.error('Socket Error:', err.message);
        socket.end();
    });
}

// Process each gauge configuration
async function processGaugeData() {
    const url = 'http://localhost:4000/getFullGaugeDataForOrganization/123e4567-e89b-12d3-a456-426614174000'; // Example URL
    const gauges = await fetchGaugeData(url);

    const activeIntervals = new Map();  // Keep track of active intervals by gauge ID

    for (const gauge of gauges) {
        const config = {
            host: gauge.host,
            port: gauge.port,
            registerType: gauge.registertype,
            registerAddress: parseInt(gauge.register_address),
            dataType: gauge.datatype,
            byteOrder: gauge.byte_order,
            speed: gauge.speed,
            count: 2,
            gaugeId: gauge.gauge_id,
            charId: gauge.characteristic_id
        };

        const topic = `gauge/${gauge.gauge_id}/${gauge.characteristic_id}`;

        // If the interval is already set for this gauge, skip it
        if (activeIntervals.has(topic)) continue;

        // Set up interval for sending data at the specified speed
        const intervalId = setInterval(() => {
            readModbusData(config);
        }, gauge.speed || 500);

        // Store the interval so it can be cleared later if needed
        activeIntervals.set(topic, intervalId);
    }
}

// Start processing the gauge data every 10 seconds
setInterval(async () => {
    console.log('Fetching new gauge data...');
    await processGaugeData();
}, 10 * 1000);

// Stop gracefully on script termination
process.on('SIGINT', () => {
    console.log('Stopping the script...');
    mqttClient.end(); // Disconnect MQTT client gracefully
    process.exit(0); 
});
