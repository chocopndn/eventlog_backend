const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Admins = sequelize.define(
    "Admins",
    {
      admin_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
      },
      department_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "department",
          key: "department_id",
        },
      },
      last_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      first_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      middle_name: {
        type: DataTypes.STRING,
      },
      suffix: {
        type: DataTypes.STRING(10),
      },
      email: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      role: {
        type: DataTypes.ENUM("Admin", "Super Admin"),
        allowNull: false,
      },
    },
    {
      tableName: "admins",
      timestamps: false,
    }
  );

  return Admins;
};
