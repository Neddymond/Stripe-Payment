"use strict"

const config = require("./config");
const { products } = require("./inventory");
const express = require("express");
const router = express.Router();
const stripe = require("stripe")(config.stripe.secretKey, { 
    apiVersion: config.stripe.apiVersion 
});

/** Render the main app html */
router.get("/", (req, res) => {
    res.render("index.html");
});

/** calculate the total payment amount based on items in basket  */
const calculatePaymentAmount = async (items) => {
    const productList = await products.listSku();

    /** look up the sku for the item so we can get the current price. */
    const skus = productList.data;
    // console.log("skus: ", skus);

    const total = items.reduce((a, item) => {
        const sku = skus.filter((sku) => sku.id === item.parent)[0];
        return a + sku.price * item.quantity;
    }, 0);
    console.log(total);
    return total; 
};

/** create the PaymentIntent on the backend */
router.post("/payment_intents", async (req, res, next) => {
    let { currency, items } = req.body;
    const amount = await calculatePaymentAmount(items);
    console.log("amount: ", amount);

    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount,
            currency,
            payment_method_types: config.paymentMethods
        });

        return res.status(200).json({ paymentIntent });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

/** Update PaymentIntent with shipping cost */
router.post("/payment_intents/:id/shipping_change", async (req, res, next) => {
    const { items, shippingOption } = req.body;
    let amount = await calculatePaymentAmount(items);
    amount += products.getShippingCost(shippingOption.id);

    try {
        const paymentIntent = await stripe.paymentIntents.update(req.params.id, { amount });

        return res.status(200).json({ paymentIntent });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** webhook handler to process payments for sources asynchronously */
router.post("/webhook", async (req, res) => {
    let data;
    let eventType;

    /** check if webhook signing is configured */
    if (config.stripe.webhookSecret) {
        /** Retrieve the event by verifying the signature using the raw body and secret */
        let event;
        let signature = req.headers["stripe-signature"];
        
        try {
            event = stripe.webhooks.constructEvent(
                req.rawBody,
                signature,
                config.stripe.secretKey
            );
        } catch (err) {
            console.log(`⚠️ Webhook signature verification failed.`);
            return res.sendStatus(400);
        }

        /** Extract the event from the event */
        data = event.data;
        eventType = event.type;
    } else {
        /** Webhook signing is recommended, but if the secret is not configured in config.js, retrieve the event directly from the request body. */
        data = req.body.data;
        eventType = req.body.type;
    }

    const object = data.object;

    /** Monitor payment_intent.succeeded and payment_intent.payment_failed events. */
    if (object.object === "payment_intent") {
        const paymentIntent = object;

        if (eventType === "payment_intent.succeeded") {
            console.log(`🔔 Webhook received! Payment for PaymentIntent ${paymentIntent.id} succeeded`);
        } else if (eventType === "payment_intent.payment_failed") {
            const paymentSourceOrmethod = paymentIntent.last_payment_error.payment_method ? paymentIntent.last_payment_error.payment_method : paymentIntent.last_payment_error.source;
            console.log(`🔔 Webhook received! Payment on ${paymentSourceOrmethod.object} ${paymentSourceOrmethod.id} of type ${paymentSourceOrmethod.type} for PaymentIntent ${paymentIntent.id} failed.`);
        }
    }

    /** Monitor "source.chargeable events." */
    if (object.object === "source" && object.status === "chargeable" &&     object.metadata.paymentIntent) {
        const source = object;
        console.log(`🔔 Webhook received! The source ${source.id} is chargeable.`);

        /** Find the corresponding paymentIntent this source is for by looking in its metadata. */
        const paymentIntent = await stripe.paymentIntents.retrieve(source.metadata.paymentIntent);

        /** Check whether this paymentIntent requires a source. */
        if (paymentIntent.status != "requires_payment_method") {
            return res.sendStatus(403);
        }

        /** Confirm the paymentIntent with the chargeable source */
        await stripe.paymentIntents.confirm(paymentIntent.id, { source: source.id });
    }

    /** Monitor "source.failed" and "source.canceled events" */
    if (object.object === "source" && ["failed", "canceled"].includes(object.status) && object.metadata.paymentIntent) {
        const source = object;
        console.log(`🔔 the source ${source.id} failed or timed out.`);

        /** Cancel the paymentIntent */
        await stripe.paymentIntents.cancel(source.metadata.paymentIntent);
    }

    /** Return a 200 success codee to Stripe */
    res.sendStatus(200);
});


/** Routes exposing the config as well as the ability to retrieve prodeucts. 
 * Expose the stripe publishable key and other pieces of config via an endpoint.
*/ 
router.get("/config", (req, res) => {
    res.json({
        stripePublishableKey: config.stripe.publishableKey,
        stripeCountry: config.stripe.country,
        country: config.country,
        currency: config.currency,
        paymentMethods: config.paymentMethods,
        shippingOptions: config.shippingOptions
    });
});

/** Retrieve all products */
router.get("/products", async (req, res) => {
    res.json(await products.list());
});

/** Retrieve a product by ID */
router.get("/products/:id", async (req, res) => {
    res.json(await products.retrieve(req.params.id));
});

/** Retrieve the skus of a product */
router.get("/products/:id/skus", async (req, res) => {
    const skus = await stripe.skus.list({ limit: 5, product: req.params.id });
    res.json(skus);
});

/** Retrieve the paymentIntent status. */
router.get("/payment_intents/:id/status", async (req, res) => {
    const paymentIntent = await stripe.paymentIntents.retrieve(req.params.id);
    res.json({paymentIntent: {status: paymentIntent.status}});
});

module.exports = router;
