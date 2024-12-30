const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const YearLevel = sequelize.define("YearLevel", {
    yearlevel_ID: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    yearLevel: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
  });
  return YearLevel;
};
