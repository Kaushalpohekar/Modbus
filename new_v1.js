const Modbus = require('jsmodbus');
const net = require('net');
const mqtt = require('mqtt');

// Static Configuration: Define your Modbus slave data here
const modbusConfigs = [
    {
        host: '192.168.1.100',   // IP address of Modbus server
        port: 502,                // Port for Modbus TCP
        slaveId: 1,               // Modbus slave ID
        registerType: 'readHoldingRegisters', // Type of register read (e.g., readHoldingRegisters, readInputRegisters)
        registerAddress: 100,     // Start address for registers
        dataType: 'unsigned_int', // Data type for conversion (e.g., unsigned_int, signed_int, float, etc.)
        byteOrder: 'msb_first',   // Byte order (msb_first or lsb_first)
        speed: 9600,              // Speed, if applicable
        count: 2,                 // Number of registers to read
        gaugeId: 'gauge_1',       // Gauge ID for MQTT topic
        charId: 'char_1'          // Characteristic ID for MQTT topic
    }
];

// Setup MQTT client
function setupMQTTClient() {
    const options = {
        host: 'dashboard.senselive.in',
        port: 1883,
        username: 'Sense2023',
        password: 'sense123',
    };

    const mqttClient = mqtt.connect(options);

    mqttClient.on('connect', () => {
        console.log('Connected to MQTT broker');
    });

    mqttClient.on('error', (err) => {
        console.error('MQTT Error:', err.message);
    });

    return mqttClient;
}

// Helper conversion functions (same as before)
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

// Read Modbus data from a specific slave
async function readModbusData(config, mqttClient) {
    const { host, port, registerType, registerAddress, dataType, byteOrder, speed, count, gaugeId, charId, slaveId } = config;
    
    const socket = new net.Socket();
    const client = new Modbus.client.TCP(socket);
    
    socket.connect({ host, port }, async () => {
        try {
            // Use the slaveId to select the slave on the Modbus TCP server
            client.setID(slaveId);

            // Perform the read operation based on register type
            const response = await client[registerType](registerAddress - 40001, count);
            
            let value;
            
            if (dataType === 'unsigned_int') {
                value = convertToLong(response.response.body.valuesAsArray, byteOrder);
            } else if (dataType === 'signed_int') {
                value = convertToSignedInt(response.response.body.valuesAsArray, byteOrder);
            } else if (dataType === 'float') {
                value = convertToFloat(response.response.body.valuesAsArray, byteOrder);
            }

            const data = { value: value };
            const topic = `gauge/${gaugeId}/${charId}`;
            publishData(mqttClient, topic, data);
            console.log("Published data for slave ID", slaveId);
        } catch (err) {
            console.error('Error reading Modbus data:', err.message);
        }
    });

    socket.on('error', (err) => {
        console.error('Socket Error:', err.message);
        socket.end();
    });
}

// Publish data to MQTT broker
function publishData(mqttClient, topic, data) {
    const message = JSON.stringify(data);
    mqttClient.publish(topic, message, { qos: 1, retain: true }, (err) => {
        if (err) {
            console.error('Error publishing to MQTT:', err.message);
        }
    });
}

// Process Modbus configurations and start reading data
async function processModbusConfigs() {
    const client = setupMQTTClient();
    const processedConfigs = new Set();  

    // Loop through configurations and read data periodically
    setInterval(() => {
        for (const config of modbusConfigs) {
            const topic = `gauge/${config.gaugeId}/${config.charId}`;
            if (processedConfigs.has(topic)) continue;

            processedConfigs.add(topic); 
            setInterval(() => {
                readModbusData(config, client);
            }, 1000);
        }
    }, 10 * 1000);
}

processModbusConfigs();

process.on('SIGINT', () => {
    console.log('Stopping the script...');
    process.exit(0);
});
