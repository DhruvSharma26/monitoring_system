const express = require("express");

const router = express.Router();

const authMiddleware =
require("../middleware/authMiddleware");

const {

    assignTask,

    getMyTasks,

    submitTask,

    verifyTask

} = require(
    "../controllers/taskController"
);

router.post(
    "/assign",
    authMiddleware,
    assignTask
);

router.get(
    "/my-tasks",
    authMiddleware,
    getMyTasks
);

router.post(
    "/submit",
    authMiddleware,
    submitTask
);

router.post(
    "/verify",
    authMiddleware,
    verifyTask
);

module.exports = router;