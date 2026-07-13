const express = require("express");

const router = express.Router();

const authMiddleware =
require("../middleware/authMiddleware");

const {

    assignTask,

    getMyTasks,

    submitTask,

    verifyTask,
    
    startTask,
    
    completeTask,
    
    updateTaskProgress

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

router.post(
    "/:taskId/start",
    authMiddleware,
    startTask
);

router.post(
    "/:taskId/complete",
    authMiddleware,
    completeTask
);

router.patch(
    "/:taskId/progress",
    authMiddleware,
    updateTaskProgress
);

module.exports = router;