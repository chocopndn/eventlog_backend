const { sequelize } = require("../config/db");
const { DataTypes } = require("sequelize");

// Import Models
const Admins = require("./admin")(sequelize, DataTypes);
const Attendance = require("./attendance")(sequelize, DataTypes);
const Block = require("./block")(sequelize, DataTypes);
const Department = require("./department")(sequelize, DataTypes);
const Event = require("./event")(sequelize, DataTypes);
const User = require("./user")(sequelize, DataTypes);
const YearLevel = require("./yearLevel")(sequelize, DataTypes);
const Code = require("./code")(sequelize, DataTypes);
const EventNames = require("./eventNames")(sequelize, DataTypes);

// Define Relationships
Admins.belongsTo(Department, { foreignKey: "department_id" });
User.belongsTo(Department, { foreignKey: "department_id" });
User.belongsTo(YearLevel, { foreignKey: "yearlevel_id" });
User.belongsTo(Block, { foreignKey: "block_id" });
Event.belongsTo(Department, { foreignKey: "department_id" });
Event.belongsTo(YearLevel, { foreignKey: "yearlevel_id" });
Event.belongsTo(Block, { foreignKey: "block_id" });
Event.belongsTo(EventNames, { foreignKey: "event_name_id", as: "eventName" });
Attendance.belongsTo(Event, { foreignKey: "event_id" });
Attendance.belongsTo(User, { foreignKey: "student_id" });
Block.belongsTo(YearLevel, { foreignKey: "yearlevel_id" });
Code.belongsTo(User, { foreignKey: "email", targetKey: "email" });

// Export Models
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
  EventNames,
};
