const Modbus = require('jsmodbus');
const net = require('net');

// Convert two 16-bit registers to different data types
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
    // Convert to signed integer
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

async function readModbusData(config) {
    const { host, port, registerType, registerAddress, dataType, byteOrder, speed, count } = config;
    
    const socket = new net.Socket();
    const client = new Modbus.client.TCP(socket);
    
    socket.connect({ host, port }, async () => {
        console.log(`Connected to Modbus Server at ${host}:${port}`);
        
        while (true) { 
            try {
                const response = await client[registerType](registerAddress, count);
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

                console.log(`Register Address: ${registerAddress}, Value: ${value}`);
            } catch (err) {
                console.error('Error reading Modbus data:', err.message);
            }
            
            await new Promise(resolve => setTimeout(resolve, speed || 500)); 
        }
    });

    socket.on('error', (err) => {
        console.error('Socket Error:', err.message);
        socket.end();
    });
}

async function processModbusConfigs(configs) {
    for (const config of configs) {
        await readModbusData(config);
    }
}

const configs = [
    {
        host: '192.168.123.50',
        port: 502,
        registerType: 'readHoldingRegisters', 
        registerAddress: 43269 - 40001, 
        dataType: 'unsigned_int', 
        byteOrder: 'msb_first', 
        speed: 500,
        count: 2
    },
];

processModbusConfigs(configs);

process.on('SIGINT', () => {
    console.log('Stopping the script...');
    process.exit(0); 
});
