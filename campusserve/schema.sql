-- CampusServe Database Schema
-- Run this file to initialize the database

CREATE DATABASE IF NOT EXISTS campusserve CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE campusserve;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    phone VARCHAR(20),
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('customer', 'provider') NOT NULL DEFAULT 'customer',
    is_available TINYINT(1) DEFAULT 0,
    earnings DECIMAL(10,2) DEFAULT 0.00,
    total_trips INT DEFAULT 0,
    avatar VARCHAR(10) DEFAULT '🧑',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Rides table
CREATE TABLE IF NOT EXISTS rides (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    provider_id INT DEFAULT NULL,
    pickup VARCHAR(150) NOT NULL,
    destination VARCHAR(150) NOT NULL,
    fare DECIMAL(8,2) NOT NULL,
    status ENUM('pending','accepted','in_progress','completed','cancelled') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Menu items table
CREATE TABLE IF NOT EXISTS menu_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    price DECIMAL(8,2) NOT NULL,
    category ENUM('fast_food','lunch','breakfast') NOT NULL,
    emoji VARCHAR(10) DEFAULT '🍽️',
    available TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    provider_id INT DEFAULT NULL,
    items JSON NOT NULL,
    total DECIMAL(10,2) NOT NULL,
    payment_method ENUM('cash','mpesa') DEFAULT 'cash',
    delivery_location VARCHAR(150),
    status ENUM('pending','preparing','out_for_delivery','delivered','cancelled') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ride_id INT NOT NULL,
    sender_id INT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ride_id) REFERENCES rides(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Seed menu items
INSERT INTO menu_items (name, description, price, category, emoji) VALUES
('Chapati & Beans', 'Freshly made chapati with stewed beans', 60.00, 'breakfast', '🫓'),
('Mandazi', 'Sweet fried dough, 3 pieces', 30.00, 'breakfast', '🍩'),
('Uji wa Wimbi', 'Traditional finger millet porridge', 40.00, 'breakfast', '🥣'),
('Omelette & Bread', 'Egg omelette with 2 slices of bread', 80.00, 'breakfast', '🍳'),
('Ugali & Sukuma Wiki', 'Maize meal with sautéed kale', 80.00, 'lunch', '🥬'),
('Rice & Beans', 'White rice with seasoned beans', 90.00, 'lunch', '🍚'),
('Pilau', 'Fragrant spiced rice with beef', 130.00, 'lunch', '🍛'),
('Githeri', 'Maize and beans stew', 70.00, 'lunch', '🫘'),
('Chips & Chicken', 'Crispy fries with fried chicken', 180.00, 'fast_food', '🍟'),
('Burger', 'Beef patty with veggies and sauce', 200.00, 'fast_food', '🍔'),
('Pizza Slice', 'Single slice of pizza', 150.00, 'fast_food', '🍕'),
('Hot Dog', 'Sausage in a bun with condiments', 120.00, 'fast_food', '🌭'),
('Samosa (2 pcs)', 'Crispy pastry filled with spiced beef', 50.00, 'fast_food', '🥟');

-- Seed a demo customer
INSERT INTO users (name, email, phone, password_hash, role) VALUES
('Demo Student', 'student@campus.ac.ke', '0712345678', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'customer'),
('Demo Rider', 'rider@campus.ac.ke', '0798765432', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'provider');
-- Demo password for both: password
