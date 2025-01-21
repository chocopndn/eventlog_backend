const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Block = sequelize.define(
    "Block",
    {
      block_id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      block_name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      yearlevel_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "year_level",
          key: "yearlevel_id",
        },
      },
    },
    {
      tableName: "block",
      timestamps: false,
    }
  );

  return Block;
};
