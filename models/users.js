const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Users = sequelize.define(
    "Users",
    {
      student_id: {
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
      yearlevel_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "year_level",
          key: "yearlevel_id",
        },
      },
      block_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "block",
          key: "block_id",
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
        type: DataTypes.ENUM("Student", "Officer"),
        allowNull: false,
      },
    },
    {
      tableName: "users",
      timestamps: false,
    }
  );

  return Users;
};
