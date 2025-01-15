const Modbus = require('jsmodbus');
const net = require('net');
const mqtt = require('mqtt');

// Static Configuration: Define your Modbus slave data here
const modbusConfigs = [
    {
        host: '192.168.0.7',   
        port: 502,                
        slaveId: 2,               
        registerType: 'readHoldingRegisters', 
        registerAddress: 40002,     
        dataType: 'float', 
        byteOrder: 'lsb_first',   
        speed: 9600,              
        count: 2,                 
        gaugeId: '8d0608bd-09b8-467b-bbfb-52915e54dbbd',       
        charId: 'bbb3a9aa-f6b6-449d-b198-cb4a9a5126c5'          
    }
];

// Setup MQTT client
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




function convertToFloat(registers, order = 'lsb_first') {
    let value;
    if (order === 'lsb_first') {
        value = (registers[0] << 16) + registers[1];
        let buffer = Buffer.alloc(4);
        buffer.writeUInt32LE(value, 0);
        return buffer.readFloatLE(0);
    } else {
        console.error("Unsupported byte order:", order);
        return null;
    }
}


// Read Modbus data from a specific slave
async function readModbusData(config, mqttClient) {
    const { host, port, registerType, registerAddress, dataType, byteOrder, count, gaugeId, charId, slaveId } = config;

    const socket = new net.Socket();
    const client = new Modbus.client.TCP(socket);

    socket.connect({ host, port }, async () => {
        try {
            const startAddress = registerAddress - 40001; // Adjust base offset if needed
            const response = await client[registerType](startAddress, count, { unitId: slaveId });

            let value;
            const registers = response.response.body.valuesAsArray;

            if (dataType === 'unsigned_int') {
                value = convertToLong(registers, byteOrder);
            } else if (dataType === 'signed_int') {
                value = convertToSignedInt(registers, byteOrder);
            } else if (dataType === 'float') {
                value = convertToFloat(registers, byteOrder);
            }

            // Adjust the value by dividing it by 10000
            const adjustedValue = value / 100000;

            console.log(slaveId, adjustedValue.toFixed(2));

            // Prepare data payload for MQTT
            const data = { value: adjustedValue.toFixed(2) };
            const topic = `guage/${gaugeId}/${charId}`;
            
            // Publish adjusted data
            publishData(mqttClient, topic, data);
            //console.log(`Published data for slave ID ${slaveId}: ${JSON.stringify(data)}`, topic);
        } catch (err) {
            console.error('Error reading Modbus data:', err.message);
        } finally {
            socket.end();
        }
    });

    socket.on('error', (err) => {
        console.error('Socket Error:', err.message);
        socket.destroy();
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
            }, 100);
        }
    }, 1000);
}

processModbusConfigs();

process.on('SIGINT', () => {
    console.log('Stopping the script...');
    process.exit(0);
});
