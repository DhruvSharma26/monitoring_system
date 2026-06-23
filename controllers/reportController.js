const Device = require("../models/Device");
const SensorData = require("../models/SensorData");
const Alert = require("../models/Alert");
const Task = require("../models/Task");

const getDailyReport = async (req, res) => {

    try {

        const totalToilets =
            await Device.countDocuments();

        const today =
            new Date();

        today.setHours(0,0,0,0);

        const alerts =
            await Alert.countDocuments({
                createdAt: {
                    $gte: today
                }
            });

        const resolvedAlerts =
            await Alert.countDocuments({
                status: "RESOLVED",
                createdAt: {
                    $gte: today
                }
            });

        const tasks =
            await Task.countDocuments({
                createdAt: {
                    $gte: today
                }
            });

        const completedTasks =
            await Task.countDocuments({
                status: "VERIFIED",
                createdAt: {
                    $gte: today
                }
            });

        res.status(200).json({

            success: true,

            report: {

                date: today,

                totalToilets,

                alerts,

                resolvedAlerts,

                tasks,

                completedTasks

            }

        });

    } catch(error) {

        console.log(error);

        res.status(500).json({
            success:false,
            message:"Server Error"
        });

    }

};

const getWeeklyReport = async (req, res) => {

    try {

        const start =
            new Date();

        start.setDate(
            start.getDate() - 7
        );

        const alerts =
            await Alert.countDocuments({
                createdAt: {
                    $gte: start
                }
            });

        const tasks =
            await Task.countDocuments({
                createdAt: {
                    $gte: start
                }
            });

        const completed =
            await Task.countDocuments({
                status:"VERIFIED",
                createdAt:{
                    $gte:start
                }
            });

        res.status(200).json({

            success:true,

            report:{

                alerts,

                tasks,

                completed

            }

        });

    } catch(error){

        console.log(error);

        res.status(500).json({
            success:false,
            message:"Server Error"
        });

    }

};
const getMonthlyReport = async (req,res)=>{

    try{

        const start =
            new Date();

        start.setMonth(
            start.getMonth()-1
        );

        const alerts =
            await Alert.countDocuments({
                createdAt:{
                    $gte:start
                }
            });

        const tasks =
            await Task.countDocuments({
                createdAt:{
                    $gte:start
                }
            });

        const completed =
            await Task.countDocuments({
                status:"VERIFIED",
                createdAt:{
                    $gte:start
                }
            });

        res.status(200).json({

            success:true,

            report:{

                alerts,

                tasks,

                completed

            }

        });

    } catch(error){

        console.log(error);

        res.status(500).json({
            success:false,
            message:"Server Error"
        });

    }

};
module.exports = {

    getDailyReport,

    getWeeklyReport,

    getMonthlyReport

};