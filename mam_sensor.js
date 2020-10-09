// Importing modules to be used
const SerialPort = require("serialport");
const moment = require("moment");

const IOTA = require("iota.lib.js");
const Mam = require("@iota/mam");

const axios = require("axios");
const { asciiToTrytes } = require("@iota/converter");
const crypto = require("crypto");

// Setting configuration variable for iota to store keys and data etc
const iotaConfig = {
  provider: "https://altnodes.devnet.iota.org:443",
  firebaseEndPoint:
    "https://us-central1-iota-data-marketplace-b074f.cloudfunctions.net/newData",
};

// Configuration of the device to which data is to be uploaded
const sensorConfig = {
  secretKey: "OVZUWZVISIUYQKP",
  sensorId: "Sensor_094",
};

// port name to listen to sensor data stream
const PORTNAME = "COM3";

// connection to the given serial port
const port = new SerialPort(PORTNAME, {
  baudRate: 9600,
  autoOpen: true,
});

// reading the data from the serial port
const Readline = SerialPort.parsers.Readline;
const parser = port.pipe(new Readline({ delimiter: "\r\n" }));

// function to generate MAM encryption key
const generateRandomKey = (length) => {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ9";
  const values = crypto.randomBytes(length);
  return Array.from(
    new Array(length),
    (x, i) => charset[values[i] % charset.length]
  ).join("");
};

// Function to publish data to the tangle and keys to the firebase
const publish = async (payload) => {
  try {
    let message;
    let mamKey;

    const time = Date.now();
    const packet = { time, data: { ...payload } };

    // Initialise MAM State
    let mamState = Mam.init(iotaConfig.provider);

    // Change MAM encryption key on each loop
    mamKey = generateRandomKey(81);

    // Set channel mode & update key
    mamState = Mam.changeMode(mamState, "restricted", mamKey);

    // Create Trytes
    const trytes = asciiToTrytes(JSON.stringify(packet));

    // Get MAM payload
    message = Mam.create(mamState, trytes);
    // Save new mamState
    mamState = message.state;

    // console.log(message, message.root);
    console.log("Root : ", message.root);
    console.log("Address : ", message.address);

    // Attach the payload and store data on the tangle
    await Mam.attach(message.payload, message.address, 3, 9);

    // Store the keys on the firebase
    await storeKeysOnFirebase(sensorConfig.secretKey, sensorConfig.sensorId, {
      sidekey: mamKey,
      root: message.root,
      time: packet.time,
    });
    console.log("Data published");
  } catch (e) {
    console.log("Error occured while publishing data to tangle", e);
  }
};

// function to store keys on the firebase
const storeKeysOnFirebase = async (sk, username, packet) => {
  const sensorId = username;
  try {
    await axios.post(iotaConfig.firebaseEndPoint, {
      id: sensorId,
      packet,
      sk,
    });
    console.log("saved in firebase");
  } catch (e) {
    console.log("Error occured while storing keys to firestore", e);
  }
};

// Serial port library events
// listening to the serial port events
port.on("open", showPortOpen);
parser.on("data", readSerialData);
port.on("close", showPortClose);
port.on("error", showError);

// Callback functions for serial port events
function showPortOpen() {
  console.log("Serial port open. Data rate: " + port.baudRate);
}

// Reading data from the serial port and uploading it
async function readSerialData(data) {
  console.log("Serial port open. Read serial data.");

  // Create JSON object:
  // Convert Arduino received data:  temp: 26.00C, humidity: 21.00%
  // to
  // json = { dateTime: '15/07/2018 10:57:35', data: { temp: '26.00C', humidity: '21.00%' } }
  //
  let json = {};

  const dateTime = moment().utc().format("DD/MM/YYYY hh:mm:ss");
  json["dateTime"] = dateTime;
  json["data"] = `{${data}}`;

  console.log("json = ", json);

  const root = await publish(json);
}

function showPortClose() {
  console.log("Serial port closed.");
}

function showError(error) {
  console.log("Serial port error: " + error);
}
