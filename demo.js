const axios = require('axios');
const mqtt = require('mqtt');

async function fetchConfiguration() {
    try {
        const response = await axios.get('http://localhost:4000/getFullGaugeDataForOrganization/123e4567-e89b-12d3-a456-426614174000');
        return response.data.data;
    } catch (error) {
        console.error('Error fetching configuration:', error.message);
        return [];
    }
}

function setupMQTTClient() {
    const options = {
        host: 'dashboard.senselive.in',
        port: 1883,
        username: 'Sense2023',
        password: 'sense123',
    };

    const client = mqtt.connect(options);

    client.on('connect', () => {
        console.log('Connected to MQTT broker');
    });

    client.on('error', (err) => {
        console.error('MQTT Error:', err.message);
    });

    return client;
}


async function readModbusData(config, client) {
    const { register_address, datatype, byteOrder, count, gauge_id, characteristic_id } = config;
    const register_addressInt = parseInt(register_address);
    
    let randomData;

    if (datatype === 'unsigned_int') {
        randomData = Math.floor(Math.random() * 52);
    } else if (datatype === 'signed_int') {
        randomData = Math.floor(Math.random() * 52) - 52;
    } else if (datatype === 'float') {
        randomData = Math.random() * 100;
    }

    console.log(`Register Address: ${register_addressInt - 40001}, Value: ${randomData}`);

    const topic = `gauge/${gauge_id}/${characteristic_id}`;
    const data = { value: randomData };

    publishData(client, topic, data);
}

function publishData(client, topic, data) {
    const message = JSON.stringify(data);
    client.publish(topic, message, { qos: 1, retain: true }, (err) => {
        if (err) {
            console.error('Error publishing to MQTT:', err.message);
        } else {
            //console.log(`Data published to ${topic}:`, data);
        }
    });
}

// async function processModbusConfigs() {
//     const client = setupMQTTClient();

//     setInterval(async () => {
//         const configs = await fetchConfiguration();

//         for (const config of configs) {
//             setInterval(() => {
//                 readModbusData(config, client);
//             }, 1000);
//         }
//     }, 10 * 1000);
// }
async function processModbusConfigs() {
    const client = setupMQTTClient();
    const processedConfigs = new Set();  

    setInterval(async () => {
        console.log(processedConfigs);
        const configs = await fetchConfiguration();

        for (const config of configs) {
            const topic = `gauge/${config.gauge_id}/${config.characteristic_id}`;
            
            // Skip processing if this topic has already been processed
            if (processedConfigs.has(topic)) continue;

            processedConfigs.add(topic);  // Mark the topic as processed

            // Start sending data for this topic
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
