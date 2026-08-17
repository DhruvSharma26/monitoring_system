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

        } catch (error) {

            console.log(error);

            res.status(500).json({
                success: false,
                message: "Server Error"
            });

        }

    };

const getThresholds = async (req, res) => {
    try {
        let settingsDoc = await Settings.findOne({ adminId: req.user.id });
        const counterVal = Number(settingsDoc?.counterThreshold) || 100;
        const odorVal = Number(settingsDoc?.odorThreshold) || 200;

        const settingsObj = {
            adminId: req.user.id,
            counterThreshold: counterVal,
            odorThreshold: odorVal,
            counterWarningThreshold: Math.round(counterVal * 0.75),
            odorWarningThreshold: Math.round(odorVal * 0.75)
        };

        res.status(200).json({ success: true, settings: settingsObj });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

module.exports = {
    updateThresholds,
    getThresholds
};