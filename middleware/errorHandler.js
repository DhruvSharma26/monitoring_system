const errorHandler = (err, req, res, next) => {
    console.error("Error:", err.message);
    if (err.stack) {
        console.error(err.stack);
    }
    
    // Mongoose duplicate key error
    if (err.code === 11000) {
        return res.status(400).json({
            success: false,
            message: "Duplicate field value entered"
        });
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const message = Object.values(err.errors).map(val => val.message).join(', ');
        return res.status(400).json({
            success: false,
            message
        });
    }

    res.status(500).json({
        success: false,
        message: err.message || "Server Error"
    });
};

module.exports = errorHandler;
