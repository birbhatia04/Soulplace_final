import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { EmptyState } from "./ui";

const statusColors: Record<string, string> = {
  Pending: "#d69d3a",
  Confirmed: "#3c7b69",
  Completed: "#6689a8",
  Cancelled: "#bb615f"
};

export default function AdminCharts({
  appointmentTrend,
  statusData,
  approvalData
}: {
  appointmentTrend: Array<{ date: string; count: number }>;
  statusData: Array<{ name: string; count: number }>;
  approvalData: Array<{ name: string; count: number }>;
}) {
  return (
    <>
      <section className="panel chart-card">
        <div className="panel-header"><div><p className="eyebrow">Demand</p><h2>Appointments over time</h2></div></div>
        {appointmentTrend.length ? <ResponsiveContainer width="100%" height={260}><AreaChart data={appointmentTrend}><defs><linearGradient id="sageArea" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4d8070" stopOpacity={0.35} /><stop offset="95%" stopColor="#4d8070" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e2d8" /><XAxis dataKey="date" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip /><Area type="monotone" dataKey="count" stroke="#3c6a5b" strokeWidth={3} fill="url(#sageArea)" /></AreaChart></ResponsiveContainer> : <EmptyState title="No appointment trend" description="Appointment records will populate this chart." />}
      </section>
      <section className="panel chart-card">
        <div className="panel-header"><div><p className="eyebrow">Outcomes</p><h2>Appointment statuses</h2></div></div>
        {statusData.length ? <ResponsiveContainer width="100%" height={260}><PieChart><Pie data={statusData} dataKey="count" nameKey="name" innerRadius={64} outerRadius={95} paddingAngle={3}>{statusData.map((entry) => <Cell key={entry.name} fill={statusColors[entry.name] || "#6b736f"} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer> : <EmptyState title="No status data" description="Status distribution will appear here." />}
        <div className="chart-legend">{statusData.map((item) => <span key={item.name}><i style={{ background: statusColors[item.name] }} />{item.name} ({item.count})</span>)}</div>
      </section>
      <section className="panel chart-card">
        <div className="panel-header"><div><p className="eyebrow">Network</p><h2>Doctor approvals</h2></div></div>
        <ResponsiveContainer width="100%" height={240}><BarChart data={approvalData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e2d8" /><XAxis dataKey="name" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip /><Bar dataKey="count" fill="#8a6628" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer>
      </section>
    </>
  );
}
