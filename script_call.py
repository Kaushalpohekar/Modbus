from pymodbus.client import ModbusTcpClient
import struct
import time

# Modbus server parameters
client = ModbusTcpClient('192.168.123.50', port=502)  # Replace with your RS485 to TCP/IP converter's IP
address = 40000 - 40001  # Modbus addresses are zero-based for pymodbus
count = 2  # Number of registers to read (2 for float values)

# Check connection
if client.connect():
    print("Connected to Modbus TCP Server")
else:
    print("Connection failed")
    exit()

# Function to convert two registers to a float value (try different byte orders)
def convert_to_float(registers, order='word_swapped'):
    if order == 'word_swapped':
        # Word-swapped: Swap the two words (useful for some Modbus implementations)
        float_value = struct.unpack('>f', struct.pack('>HH', registers[1], registers[0]))[0]
    return float_value

# Continuous reading loop
try:
    while True:
        # Read Modbus holding registers (2 consecutive registers for float)
        result = client.read_holding_registers(address, count)
        
        # Check if the read was successful
        if result.isError():
            print("Failed to read Modbus data")
        else:
            # Convert the two registers to a floating-point value
            float_value = convert_to_float(result.registers, order='word_swapped')

            # Apply scaling (divide by 10,000)
            scaled_value = float_value / 10000
            
            # Display the scaled floating-point value
            print(f"Scaled float value at address 40001: {scaled_value}")
        
        # Delay before the next read
        time.sleep(1)

except KeyboardInterrupt:
    print("Stopping the script...")

finally:
    # Close the connection when the loop is stopped
    client.close()
