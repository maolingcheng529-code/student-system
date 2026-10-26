import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const users = sqliteTable('users', {
  id:text('id').primaryKey(), name:text('name').notNull(), className:text('class_name').notNull().default(''),
  role:text('role').notNull().default('student'), passwordHash:text('password_hash'), activatedAt:integer('activated_at'),
});
export const sessions=sqliteTable('sessions',{
  tokenHash:text('token_hash').primaryKey(), userId:text('user_id').notNull().references(()=>users.id),
  expiresAt:integer('expires_at').notNull(),
});
export const learningState=sqliteTable('learning_state',{
  userId:text('user_id').primaryKey().references(()=>users.id), data:text('data').notNull(), updatedAt:integer('updated_at').notNull(),
});
export const documents=sqliteTable('documents',{
  id:text('id').primaryKey(), name:text('name').notNull(), text:text('text').notNull().default(''), pages:text('pages').notNull().default('[]'),
  size:integer('size').notNull(), mime:text('mime').notNull(), objectKey:text('object_key').notNull(),
  createdBy:text('created_by').notNull().references(()=>users.id), createdAt:integer('created_at').notNull(),
});
export const authLimits=sqliteTable('auth_limits',{
  key:text('key').primaryKey(), count:integer('count').notNull(), resetAt:integer('reset_at').notNull(),
});
export const courseSources=sqliteTable('course_sources',{
  id:text('id').primaryKey(), title:text('title').notNull(), sourceUrl:text('source_url').notNull(),
  payload:text('payload').notNull(), enabled:integer('enabled').notNull().default(1), importedAt:text('imported_at').notNull(),
});
