"use strict";
const path = require("path");

/** load environment for the .env file */
// require('dotenv').config();

module.exports = {
    /** default country for the checkout form */
    country: "US",

    /** store currency */
    currency: "eur",

    /** supprted payment mathod for the store.
     * Some payment methods support only a subset of currency
     */
    paymentMethods: [
        "alipay", // aud, cad, eur, gbp, hkd, jpy, nzd, sgd, or usd.
        "bancontact", // eur (Bancontact must always use Euros)
        "card", // many
        "eps", // eur (EPS must usr Euros)
        "ideal", //eur (IDEAL must always use Euros)
        "giropay", // eur Giropay must always use Euros)
        "multibanco", // eur (Multibanco must always use Euros)
        "sofort", // eur (SOFORT must always use Euros)
        "wechat", // aud, cad, eur, gbp, hkd, jpy, sgd, or usd.
    ],

    stripe: {
        /** The two-letter country code of your Stripe account (required for payment Request). */
        country: process.env.STRIPE_ACCOUNT_COUNTRY || "US",

        /** Test key is used for development and live key is used for real changes in production */
        publishableKey: process.env.STRIPE_PUBLIC_KEY,
        secretKey: process.env.STRIPE_SECRET_KEY,

        /** set webhook in order to verify sgnatures */
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
    },

    /** shipping options for the payment Request API */
    shippingOptions: [
        {
            id: "free",
            label: "Free Shipping",
            detail: "Delivery within 5 days",
            amount: 0
        },
        {
            id: "express",
            label: "Express Shipping",
            detail: "Next day delivery",
            amount: 500
        }
    ],

    /** server port */
    port: process.env.PORT || 8000,

    /** Tunnel to serve the app over HTTPS and be able to receive webhooks localy. */
    ngrok: {
        enabled: process.env.NODE_ENV !== "production",
        port: process.env.PORT || 8000
    }
}
