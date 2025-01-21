const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Event = sequelize.define(
    "Event",
    {
      event_id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      department_id: {
        type: DataTypes.INTEGER,
        references: {
          model: "department",
          key: "department_id",
        },
      },
      yearlevel_id: {
        type: DataTypes.INTEGER,
        references: {
          model: "year_level",
          key: "yearlevel_id",
        },
      },
      block_id: {
        type: DataTypes.INTEGER,
        references: {
          model: "block",
          key: "block_id",
        },
      },
      event_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      venue: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      morning_time_in: {
        type: DataTypes.TIME,
        allowNull: true,
      },
      morning_time_out: {
        type: DataTypes.TIME,
        allowNull: true,
      },
      afternoon_time_in: {
        type: DataTypes.TIME,
        allowNull: true,
      },
      afternoon_time_out: {
        type: DataTypes.TIME,
        allowNull: true,
      },
      scan_personnel: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "events",
      timestamps: false,
    }
  );

  return Event;
};
