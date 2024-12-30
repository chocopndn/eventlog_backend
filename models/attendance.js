const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Attendance = sequelize.define("Attendance", {
    attendance_ID: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    event_ID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "Event",
        key: "event_ID",
      },
    },
    student_ID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "Users",
        key: "student_ID",
      },
    },
    morning_TimeIn: {
      type: DataTypes.TIME,
    },
    morning_TimeOut: {
      type: DataTypes.TIME,
    },
    afternoon_TimeIn: {
      type: DataTypes.TIME,
    },
    afternoon_TimeOut: {
      type: DataTypes.TIME,
    },
  });
  return Attendance;
};
