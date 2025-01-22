const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Code = sequelize.define(
    "Code",
    {
      code_id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        references: {
          model: "users",
          key: "email",
        },
      },
      reset_code: {
        type: DataTypes.INTEGER,
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

  return Code;
};
