const ModbusRTU = require('modbus-serial');
const mqtt = require('mqtt');

// Modbus Configuration
const modbusConfigs = [
    {
        host: '192.168.0.7',
        port: 502,
        registerType: 'readHoldingRegisters',
        registerAddress: 40002,
        dataType: 'float',
        byteOrder: 'lsb_first',
        speed: 1000, // Polling interval in ms
        count: 2,
        slaves: [
            { slaveId: 1, gaugeId: '8d0608bd-09b8-467b-bbfb-52915e54dbbd', charId: 'bbb3a9aa-f6b6-449d-b198-cb4a9a5126c5' },
            { slaveId: 2, gaugeId: '1a72e9c4-8d4c-4b6a-b124-a1f2b3c4d5e6', charId: 'd13a09b0-5b4c-4d56-8e3a-1fa3c67183aa' },
            { slaveId: 3, gaugeId: '2b72d9a7-9c5d-4e6a-a234-b2e3f4c5d7e8', charId: '8c5bda9e-bf52-412e-a52e-96cb7b473c2f' },
        ]
    }
];

// MQTT Client Setup
function setupMQTTClient() {
    const options = {
        host: '65.2.127.156',
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

// Convert Registers to Float
// function convertToFloat(registers, order = 'lsb_first') {
//     let value;
//     if (order === 'lsb_first') {
//         value = (registers[0] << 16) + registers[1];
//         const buffer = Buffer.alloc(4);
//         buffer.writeUInt32LE(value, 0);
//         return buffer.readFloatLE(0);
//     } else {
//         console.error('Unsupported byte order:', order);
//         return null;
//     }
// }
function convertToFloat(registers, order = 'lsb_first') {
    let value;
    if (order === 'lsb_first') {
        value = (registers[0] << 16) | registers[1];
        if (value > 0x7FFFFFFF) {
            value -= 0x100000000;
        }
        const buffer = Buffer.alloc(4);
        buffer.writeInt32LE(value, 0);
        return buffer.readFloatLE(0);
    } else {
        console.error('Unsupported byte order:', order);
        return null;
    }
}


// Read Modbus Data for a Specific Slave
async function readModbusData(client, config, slave, mqttClient) {
    const { registerType, registerAddress, dataType, byteOrder, count } = config;
    const { slaveId, gaugeId, charId } = slave;

    try {
        await client.setID(slaveId);

        // Adjust Modbus register address offset
        const startAddress = registerAddress - 40001;

        const data = await client[registerType](startAddress, count);

        let value;
        const registers = data.data;

        if (dataType === 'float') {
            value = convertToFloat(registers, byteOrder);
        }

        // Adjust the value by dividing it by 10000
        const adjustedValue = value / 100000;

        console.log(`Slave ${slaveId}: ${adjustedValue.toFixed(2)}`);

        // Publish data to MQTT
        const topic = `guage/${gaugeId}/${charId}`;
        const payload = { value: adjustedValue.toFixed(2) };
        publishData(mqttClient, topic, payload);

    } catch (err) {
        console.error(`Error reading data for Slave ${slaveId}:`, err.message);
    }
}

// Publish Data to MQTT
function publishData(mqttClient, topic, data) {
    const message = JSON.stringify(data);
    mqttClient.publish(topic, message, { qos: 1, retain: true }, (err) => {
        if (err) {
            console.error('Error publishing to MQTT:', err.message);
        }
    });
}

// Process Modbus Configurations
async function processModbusConfigs() {
    const mqttClient = setupMQTTClient();

    for (const config of modbusConfigs) {
        const { host, port, slaves, speed } = config;

        // Create a Modbus TCP client
        const client = new ModbusRTU();

        try {
            await client.connectTCP(host, { port });
            console.log(`Connected to Modbus server at ${host}:${port}`);

            // Poll each slave in sequence
            setInterval(async () => {
                for (const slave of slaves) {
                    await readModbusData(client, config, slave, mqttClient);
                }
            }, speed || 1000); // Default polling interval

        } catch (err) {
            console.error(`Failed to connect to Modbus server at ${host}:${port}:`, err.message);
            client.close();
        }

        client.on('close', () => {
            console.log(`Connection to ${host}:${port} closed`);
        });
    }
}

processModbusConfigs();

process.on('SIGINT', () => {
    console.log('Stopping the script...');
    process.exit(0);
});
