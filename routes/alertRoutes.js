const express = require("express");

const router = express.Router();

const authMiddleware =
require("../middleware/authMiddleware");

const {

    getAlerts,

    getAlertDetails,

    resolveAlert

} = require(
    "../controllers/alertController"
);

router.get(
    "/",
    authMiddleware,
    getAlerts
);
router.post(
    "/resolve",
    authMiddleware,
    resolveAlert
);
router.get(
    "/:alertId",
    authMiddleware,
    getAlertDetails
);



module.exports = router;