const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Event = sequelize.define("Event", {
    event_ID: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    department_ID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "Department",
        key: "department_ID",
      },
    },
    yearlevel_ID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "YearLevel",
        key: "yearlevel_ID",
      },
    },
    block_ID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "Block",
        key: "block_ID",
      },
    },
    eventName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    startTime: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    endTime: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });
  return Event;
};
