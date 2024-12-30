const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Users = sequelize.define("Users", {
    student_ID: {
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
      type: DataTypes.ENUM("Student", "Officer"),
      allowNull: false,
    },
  });
  return Users;
};
