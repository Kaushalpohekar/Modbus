from pymodbus.client import ModbusTcpClient
import struct
import time

# Modbus server parameters
client = ModbusTcpClient('192.168.123.50', port=502)  # Replace with your RS485 to TCP/IP converter's IP
address = 43267 - 40001  # Convert Modbus address to zero-based for pymodbus
count = 2  # Number of registers to read (2 for a 32-bit value)

# Check connection
if client.connect():
    print("Connected to Modbus TCP Server")
else:
    print("Connection failed")
    exit()

# Function to convert two registers to a 32-bit integer (with MSB first)
def convert_to_long(registers, order='msb_first'):
    if order == 'msb_first':
        # MSB first: combine the two registers
        long_value = (registers[0] << 16) + registers[1]
    elif order == 'lsb_first':
        # LSB first: reverse the register order
        long_value = (registers[1] << 16) + registers[0]
    return long_value

# Continuous reading loop
try:
    while True:
        # Read Modbus holding registers (2 consecutive registers for a 32-bit value)
        result = client.read_holding_registers(address, count)
        
        # Check if the read was successful
        if result.isError():
            print("Failed to read Modbus data")
        else:
            # Convert the two registers to a 32-bit integer
            long_value = convert_to_long(result.registers, order='msb_first')

            # Display the 32-bit integer value
            print(f"Long integer value at address 43269: {long_value}")
        
        # Delay before the next read
        time.sleep(0.1)

except KeyboardInterrupt:
    print("Stopping the script...")

finally:
    # Close the connection when the loop is stopped
    client.close()
