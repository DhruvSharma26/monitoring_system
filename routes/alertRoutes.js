const express = require("express");

const router = express.Router();

const authMiddleware =
require("../middleware/authMiddleware");

const {

    getAlerts,

    getAlertDetails,

    resolveAlert,
    
    assignAlert,

    deleteAlert

} = require(
    "../controllers/alertController"
);

router.get(
    "/",
    authMiddleware,
    getAlerts
);
router.post(
    "/:alertId/resolve",
    authMiddleware,
    resolveAlert
);
router.post(
    "/:alertId/assign",
    authMiddleware,
    assignAlert
);
router.get(
    "/:alertId",
    authMiddleware,
    getAlertDetails
);
router.delete(
    "/:alertId",
    authMiddleware,
    deleteAlert
);

module.exports = router;