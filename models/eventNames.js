const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const EventNames = sequelize.define(
    "EventNames",
    {
      event_name_id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      event_name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
    },
    {
      tableName: "event_names",
      timestamps: false,
    }
  );

  return EventNames;
};
