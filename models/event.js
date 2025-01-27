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
        allowNull: true,
      },
      yearlevel_id: {
        type: DataTypes.INTEGER,
        references: {
          model: "year_level",
          key: "yearlevel_id",
        },
        allowNull: true,
      },
      block_id: {
        type: DataTypes.INTEGER,
        references: {
          model: "block",
          key: "block_id",
        },
        allowNull: true,
      },
      event_name_id: {
        type: DataTypes.INTEGER,
        references: {
          model: "event_names",
          key: "event_name_id",
        },
        allowNull: false,
      },
      venue: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      date_of_event: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      am_in: {
        type: DataTypes.TIME,
        allowNull: true,
      },
      am_out: {
        type: DataTypes.TIME,
        allowNull: true,
      },
      pm_in: {
        type: DataTypes.TIME,
        allowNull: true,
      },
      pm_out: {
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
