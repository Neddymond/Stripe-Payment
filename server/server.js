"use strict"

const config = require("./config");
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const ngrok = config.ngrok.enabled ? require("ngrok") : null;
const app = express();
require("dotenv").config();

/** Setup useful middleware */
app.use(
    bodyParser.json({
        /** Verify webhook signatures. Let's compute it only when hitting the stripe webhook endpoint */
        verify: (req, res, buf) => {
            if(req.originalUrl.startsWith("/webhook")) {
                req.rawBody = buf.toString();
            }
        }
    })
);
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static(path.join(__dirname, "../views")));
app.set("views", path.join(__dirname, "../views"));
app.engine("html", require("ejs").renderFile);
app.set("view engine", "html");

/** Define routes */
app.use("/", require("./routes"));

console.log(`port: ${config.port}, node-env: ${config.ngrok.enabled}`);

/** start the server on the correct port */
const server = app.listen(config.port, () => console.log(`🚀 server listening on port ${server.address().port}`));

/** Turn on the ngrok tunnel in development, which provides both the mandatory HTTPS
 * support for all card payments, and the ability to consume webhooks locally.
 */
if (ngrok) {
    ngrok.connect({
        addr: config.ngrok.port,
    })
    .then((url) => console.log(`💳 App Url to see the demo in the browser: ${url}/`))
    .catch((err) => {
        if (err.code === "ECONNREFUSED") {
            Consolel.log(`⚠️ Connection refused at ${err.address}:${err.port}`);
        } else {
            console.log(`⚠️ Ngrok error: ${JSON.stringify(err)}`);
        }
        process.exit(1);
    });
};