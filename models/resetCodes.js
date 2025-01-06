const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Codes = sequelize.define(
    "Codes",
    {
      code_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      student_ID: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "Users",
          key: "student_ID",
        },
      },
      reset_code: {
        type: DataTypes.CHAR(5),
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      used: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
    },
    {
      tableName: "password_reset_codes",
      timestamps: false,
    }
  );

  return Codes;
};
