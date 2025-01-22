const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const User = sequelize.define(
    "User",
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
        defaultValue: null,
      },
      email: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
        validate: {
          isEmail: true,
        },
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      role: {
        type: DataTypes.ENUM("Student", "Officer"),
        allowNull: false,
        validate: {
          isIn: [["Student", "Officer"]],
        },
      },
    },
    {
      tableName: "users",
      timestamps: false,
      hooks: {
        beforeCreate: async (user) => {
          if (user.password) {
            const bcrypt = require("bcrypt");
            user.password = await bcrypt.hash(user.password, 10);
          }
        },
      },
    }
  );

  return User;
};
