const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Block = sequelize.define("Block", {
    block_ID: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    blockName: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    yearlevel_ID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "YearLevel",
        key: "yearlevel_ID",
      },
    },
  });
  return Block;
};
