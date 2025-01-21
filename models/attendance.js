const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Attendance = sequelize.define(
    "Attendance",
    {
      attendance_id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      event_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "events",
          key: "event_id",
        },
      },
      student_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "users",
          key: "student_id",
        },
      },
      morning_time_in: {
        type: DataTypes.TIME,
      },
      morning_time_out: {
        type: DataTypes.TIME,
      },
      afternoon_time_in: {
        type: DataTypes.TIME,
      },
      afternoon_time_out: {
        type: DataTypes.TIME,
      },
    },
    {
      tableName: "attendance",
      timestamps: false,
    }
  );

  return Attendance;
};
