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
};
const getReportStats = async (req, res) => {
    try {
        const stats = {
            total_reports: 12,
            avg_rating: 4.2,
            total_alerts: 45,
            resolved_alerts: 38,
            pending_alerts: 7,
            avg_response_time: "15m"
        };
        res.status(200).json(stats);
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

const getReportsList = async (req, res) => {
    try {
        const reports = [
            {
                id: "rep_1",
                title: "Weekly Performance Report",
                date: "2026-07-10",
                status: "ready",
                download_url: "https://example.com/report1.pdf",
                preview_url: "https://example.com/report1.pdf"
            }
        ];
        res.status(200).json({ success: true, reports });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

const generateReport = async (req, res) => {
    try {
        res.status(200).json({ success: true, message: "Report generation started" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

module.exports = {
    getDailyReport,
    getWeeklyReport,
    getMonthlyReport,
    getReportStats,
    getReportsList,
    generateReport
};