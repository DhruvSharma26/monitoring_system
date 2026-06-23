const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema(
{
    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    counterThreshold: {
        type: Number,
        default: 100
    },

    odorThreshold: {
        type: Number,
        default: 80
    }
},
{
    timestamps: true
});

module.exports =
mongoose.model(
    "Settings",
    settingsSchema
);