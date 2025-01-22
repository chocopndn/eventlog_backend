const { sequelize } = require("../config/db");
const { DataTypes } = require("sequelize");

const Admins = require("./admin")(sequelize, DataTypes);
const Attendance = require("./attendance")(sequelize, DataTypes);
const Block = require("./block")(sequelize, DataTypes);
const Department = require("./department")(sequelize, DataTypes);
const Event = require("./event")(sequelize, DataTypes);
const User = require("./user")(sequelize, DataTypes);
const YearLevel = require("./yearLevel")(sequelize, DataTypes);
const Code = require("./code")(sequelize, DataTypes);

Admins.belongsTo(Department, { foreignKey: "department_ID" });
User.belongsTo(Department, { foreignKey: "department_ID" });
User.belongsTo(YearLevel, { foreignKey: "yearlevel_ID" });
User.belongsTo(Block, { foreignKey: "block_ID" });
Event.belongsTo(Department, { foreignKey: "department_ID" });
Event.belongsTo(YearLevel, { foreignKey: "yearlevel_ID" });
Event.belongsTo(Block, { foreignKey: "block_ID" });
Attendance.belongsTo(Event, { foreignKey: "event_ID" });
Attendance.belongsTo(User, { foreignKey: "student_ID" });
Block.belongsTo(YearLevel, { foreignKey: "yearlevel_ID" });
Code.belongsTo(User, { foreignKey: "email" });

module.exports = {
  sequelize,
  Admins,
  Attendance,
  Block,
  Department,
  Event,
  User,
  YearLevel,
  Code,
};
