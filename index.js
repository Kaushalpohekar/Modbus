const Modbus = require('jsmodbus');
const net = require('net');
const axios = require('axios');
const mqtt = require('mqtt');

async function fetchConfiguration() {
    try {
        const response = await axios.get('http://localhost:4000/getFullGaugeDataForOrganization/123e4567-e89b-12d3-a456-426614174000');
        const modifiedConfig = response.data.data.map(gauge => {
            return {
                host: gauge.host,
                port: gauge.port,
                registerType: gauge.registertype,
                registerAddress: parseInt(gauge.register_address),
                dataType: gauge.datatype,
                byteOrder: gauge.byte_order,
                speed: parseInt(gauge.speed),
                count: 2,  // Assuming a static value for count
                gaugeId: gauge.gauge_id,
                charId: gauge.characteristic_id
            };
        });
        return modifiedConfig;  // Return the modified configuration for further processing
    } catch (error) {
        console.error('Error fetching configuration:', error.message);
        return [];  // Return an empty array in case of an error
    }
}


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
    // Convert 32-bit to float
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

async function readModbusData(config, mqttClient) {
    const { host, port, registerType, registerAddress, dataType, byteOrder, speed, count, gaugeId, charId } = config;
    
    const socket = new net.Socket();
    const client = new Modbus.client.TCP(socket);
    
    socket.connect({ host, port }, async () => {
        //console.log(`Connected to Modbus Server at ${host}:${port}`);
        
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

            const data = { value: value };
            const topic = `gauge/${gaugeId}/${charId}`;
            publishData(mqttClient, topic, data);
            console.log("Published the data!")
        } catch (err) {
            console.error('Error reading Modbus data:', err.message);
        }
    });

    socket.on('error', (err) => {
        console.error('Socket Error:', err.message);
        socket.end();
    });
}


function publishData(mqttClient, topic, data) {
    const message = JSON.stringify(data);
    mqttClient.publish(topic, message, { qos: 1, retain: true }, (err) => {
        if (err) {
            console.error('Error publishing to MQTT:', err.message);
        } else {
            //registerAddress(`Data published to ${topic}`);
        }
    });
}

async function processModbusConfigs() {
    const client = setupMQTTClient();
    const processedConfigs = new Set();  

    setInterval(async () => {
        const configs = await fetchConfiguration();
        console.log("Refetch the Data!!")

        for (const config of configs) {
            const topic = `gauge/${config.gauge_id}/${config.characteristic_id}`;
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
    registerAddress('Stopping the script...');
    process.exit(0);
});
