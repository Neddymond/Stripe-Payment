"use strict"

const config = require("./config");
const { products } = require("./inventory");
const express = require("express");
const router = express.Router();
const stripe = require("stripe")(config.stripe.secretKey);

/** Render the main app html */
router.get("/", (req, res) => {
    res.render("index.html");
});

/** calculate the total payment amount based on items in basket  */
const calculatePaymentAmount = async (items) => {
    const productList = await products.list(); 

    /** look up the sku for the item so we can get the current price. */
    const skus = productList.data.reduce((a, product) => {
        [...a, product.skus.data], []
    });

    const total = items.reduce((a, item) => {
        const sku = skus.filter((sku) => sku.id === item.parent)[0];
        return a + sku.price * item.quantity;
    }, 0);
    return total; 
};

/** create the PaymentIntent on the backend */
router.post("/payment_intents", async (req, res, next) => {
    let { currency, items } = req.body;
    const amount = calculatePaymentAmount(items);

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
        const paymentIntent = await stripe.paymentIntent.update(req.params.id, { amount });

        return res.status(200).json({ paymentIntent });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});