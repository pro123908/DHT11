import Mam from "@iota/mam";
import axios from "axios";
import { asciiToTrytes } from "@iota/converter";
import crypto from "crypto";
import SerialPort from "serialport";
import moment from "moment";
import IOTA from "iota.lib.js";

const iotaConfig = {
  provider: "https://nodes.comnet.thetangle.org:443",
  firebaseEndPoint:
    "https://us-central1-iota-data-marketplace-b074f.cloudfunctions.net/newData",
};

const sensorConfig = {
  secretKey: "HOKZNSXQUTVPVFM",
  sensorId: "Sensor_094",
};

const generateRandomKey = (length) => {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ9";
  const values = crypto.randomBytes(length);
  return Array.from(
    new Array(length),
    (x, i) => charset[values[i] % charset.length]
  ).join("");
};

const publish = async (packet) => {
  try {
    let message;
    let mamKey;

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

    console.log(message, message.root);
    // Attach the payload.
    await Mam.attach(message.payload, message.address, 3, 10);

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
