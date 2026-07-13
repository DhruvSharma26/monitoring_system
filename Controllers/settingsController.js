const Settings =
require("../models/Settings");

const updateThresholds =
async (req, res) => {

    try {

        const {
            counterThreshold,
            odorThreshold
        } = req.body;

        let settings =
        await Settings.findOne({
            adminId: req.user.id
        });

        if (!settings) {

            settings =
            await Settings.create({

                adminId:
                req.user.id,

                counterThreshold,

                odorThreshold

            });

        } else {

            settings.counterThreshold =
            counterThreshold;

            settings.odorThreshold =
            odorThreshold;

            await settings.save();

        }

        res.status(200).json({
            success: true,
            settings
        });

    } catch(error) {

        console.log(error);

        res.status(500).json({
            success:false,
            message:"Server Error"
        });

    }

const getThresholds = async (req, res) => {
    try {
        let settings = await Settings.findOne({ adminId: req.user.id });
        if (!settings) {
            settings = { counterThreshold: 100, odorThreshold: 80 }; // defaults
        }
        res.status(200).json({ success: true, settings });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

module.exports = {
    updateThresholds,
    getThresholds
};