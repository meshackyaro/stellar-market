"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import axios from "axios";
import { useSocket } from "@/context/SocketContext";
import { useAuth } from "@/context/AuthContext";
import { Notification } from "@/types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";

export default function NotificationBell() {
    const { socket } = useSocket();
    const { token, user } = useAuth();
    const [unreadCount, setUnreadCount] = useState(0);

    const fetchUnreadCount = useCallback(async () => {
        if (!token) return;
        try {
            const res = await axios.get<{ count: number }>(`${API}/notifications/unread-count`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setUnreadCount(res.data.count);
        } catch (error) {
            console.error("Failed to fetch unread count:", error);
        }
    }, [token]);

    // Initial fetch and polling every 30s
    useEffect(() => {
        fetchUnreadCount();
        const interval = setInterval(fetchUnreadCount, 30000);
        return () => clearInterval(interval);
    }, [fetchUnreadCount]);

    useEffect(() => {
        if (!socket) return;

        const handleNewNotification = (notification: Notification) => {
            // Increment unread count locally when a new notification arrives
            setUnreadCount((prev) => prev + 1);
        };

        const handleNotificationsRead = () => {
            // Reset count if notifications are marked as read elsewhere
            setUnreadCount(0);
        };

        socket.on("notification:new", handleNewNotification);
        socket.on("notifications:read", handleNotificationsRead);

        return () => {
            socket.off("notification:new", handleNewNotification);
            socket.off("notifications:read", handleNotificationsRead);
        };
    }, [socket]);

    if (!user) return null;

    return (
        <Link
            href="/notifications"
            className="relative p-2 rounded-lg text-theme-text hover:text-theme-heading hover:bg-theme-border/50 transition-colors"
            aria-label="Notifications"
            id="notification-bell"
        >
            <Bell size={20} />
            {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-theme-error opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-theme-error text-[10px] text-white font-bold items-center justify-center">
                        {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                </span>
            )}
        </Link>
    );
}
