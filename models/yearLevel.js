const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const YearLevel = sequelize.define(
    "YearLevel",
    {
      yearlevel_id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      year_level: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
    },
    {
      tableName: "year_level",
      timestamps: false,
    }
  );

  return YearLevel;
};
