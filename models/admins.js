const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Admins = sequelize.define("Admins", {
    admin_ID: {
      type: DataTypes.INTEGER,
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
    lastName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    middleName: {
      type: DataTypes.STRING,
    },
    suffix: {
      type: DataTypes.STRING(10),
    },
    email: {
      type: DataTypes.STRING,
      unique: true,
    },
    password: {
      type: DataTypes.STRING,
    },
    role: {
      type: DataTypes.ENUM("Admin", "Super Admin"),
      allowNull: false,
    },
  });
  return Admins;
};
