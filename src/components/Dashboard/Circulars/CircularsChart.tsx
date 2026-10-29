import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Chart } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    ArcElement,
    Tooltip,
    Legend,
    Title,
    CategoryScale,
    LinearScale,
    BarElement,
    LineElement,
    PointElement,
    Plugin,
    type ChartData,
} from 'chart.js';
import { SelectButton } from 'primereact/selectbutton';
import dmsLifecycleService from '../../../services/DMSLifecycleService';
import './CircularsChart.scss';

ChartJS.register(ArcElement, Tooltip, Legend, Title, CategoryScale, LinearScale, BarElement, LineElement, PointElement);

type ChartKind = 'doughnut' | 'pie' | 'bar' | 'line' | 'polarArea';

/** api/Circular/GetCIR_CategoryChartData: one row per category. */
interface CategoryCount {
    category?: string;
    total?: number;
}

interface CircularsChartProps {
    circularType: string;
}

const CircularsChart: React.FC<CircularsChartProps> = ({ circularType }) => {
    const [chartType, setChartType] = useState('bar');
    const [chartData, setChartData] = useState<ChartData<ChartKind, number[], string> | null>(null);
    const [loading, setLoading] = useState(true);

    const chartTypeOptions = useMemo(() => [
        { icon: 'pi pi-chart-pie', value: 'doughnut', label: 'Doughnut' },
        { icon: 'pi pi-circle', value: 'pie', label: 'Pie' },
        { icon: 'pi pi-chart-bar', value: 'bar', label: 'Bar' }
    ], []);

    const fetchChartData = useCallback(async () => {
        setLoading(true);
        try {
            const data = await dmsLifecycleService.getApiCall<CategoryCount[] | { category?: string[]; total?: number[] } | null>(`Circular/GetCIR_CategoryChartData?circularType=${circularType}`);
            
            if (data && Array.isArray(data) && data.length > 0) {
                const labels = data.map((item) => item.category || '');
                const values = data.map((item) => item.total || 0);
                
                setChartData({
                    labels: labels,
                    datasets: [
                        {
                            label: 'Circulars Count',
                            data: values,
                            backgroundColor: [
                                'rgba(75, 192, 192, 0.6)',
                                'rgba(255, 206, 86, 0.6)',
                                'rgba(255, 99, 132, 0.6)',
                                'rgba(54, 162, 235, 0.6)',
                                'rgba(153, 102, 255, 0.6)',
                                'rgba(255, 159, 64, 0.6)',
                                'rgba(16, 185, 129, 0.6)',
                                'rgba(236, 72, 153, 0.6)'
                            ],
                            borderColor: [
                                'rgba(75, 192, 192, 1)',
                                'rgba(255, 206, 86, 1)',
                                'rgba(255, 99, 132, 1)',
                                'rgba(54, 162, 235, 1)',
                                'rgba(153, 102, 255, 1)',
                                'rgba(255, 159, 64, 1)',
                                'rgba(16, 185, 129, 1)',
                                'rgba(236, 72, 153, 1)'
                            ],
                            borderWidth: 2,
                            fill: false,
                            tension: 0.4,
                            pointRadius: 5,
                            pointHoverRadius: 7,
                        },
                    ],
                });
            } else if (data && !Array.isArray(data) && data.category && data.total) {
                // Handle object response with category and total arrays
                setChartData({
                    labels: data.category || [],
                    datasets: [
                        {
                            label: 'Circulars Count',
                            data: data.total || [],
                            backgroundColor: [
                                'rgba(75, 192, 192, 0.6)',
                                'rgba(255, 206, 86, 0.6)',
                                'rgba(255, 99, 132, 0.6)',
                                'rgba(54, 162, 235, 0.6)',
                                'rgba(153, 102, 255, 0.6)',
                                'rgba(255, 159, 64, 0.6)',
                                'rgba(16, 185, 129, 0.6)',
                                'rgba(236, 72, 153, 0.6)'
                            ],
                            borderColor: [
                                'rgba(75, 192, 192, 1)',
                                'rgba(255, 206, 86, 1)',
                                'rgba(255, 99, 132, 1)',
                                'rgba(54, 162, 235, 1)',
                                'rgba(153, 102, 255, 1)',
                                'rgba(255, 159, 64, 1)',
                                'rgba(16, 185, 129, 1)',
                                'rgba(236, 72, 153, 1)'
                            ],
                            borderWidth: 2,
                            fill: false,
                            tension: 0.4,
                            pointRadius: 5,
                            pointHoverRadius: 7,
                        },
                    ],
                });
            } else {
                console.warn('Unexpected data format:', data);
                setChartData(null);
            }
        } catch (error) {
            console.error('Error fetching chart data:', error);
            setChartData(null);
        } finally {
            setLoading(false);
        }
    }, [circularType]);

    useEffect(() => {
        fetchChartData();
    }, [fetchChartData]);

    const getChartTitle = () => {
        const type = circularType?.toLowerCase() || 'circulars';
        switch (type) {
            case 'circulars':
                return 'Circulars by Category';
            case 'alerts':
                return 'Alerts by Category';
        }
    };

    const maxValue = useMemo(() => {
        if (chartData && chartData.datasets && chartData.datasets[0] && chartData.datasets[0].data) {
            return Math.max(...chartData.datasets[0].data);
        }
        return 0;
    }, [chartData]);

    const totalCount = useMemo(() => {
        if (chartData && chartData.datasets && chartData.datasets[0] && chartData.datasets[0].data) {
            return chartData.datasets[0].data.reduce((sum: number, val: number) => sum + val, 0);
        }
        return 0;
    }, [chartData]);

    const centerTextPlugin: Plugin = useMemo(() => ({
        id: 'centerText',
        afterDatasetsDraw(chart: ChartJS) {
            const ctx = chart.ctx;
            const type = (chart.config as { type?: string }).type;
            
            if (type === 'doughnut' || type === 'pie' || type === 'polarArea') {
                const { height } = chart;
                const chartArea = chart.chartArea;
                const centerX = (chartArea.left + chartArea.right) / 2;
                const centerY = (chartArea.top + chartArea.bottom) / 2;
                
                // Draw center total for doughnut and pie only
                if (type === 'doughnut' || type === 'pie') {
                    ctx.restore();
                    const fontSize = (height / 150).toFixed(2);
                    ctx.font = `bold ${fontSize}em sans-serif`;
                    ctx.textBaseline = 'middle';
                    ctx.textAlign = 'center';
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                    
                    const text = totalCount.toString();
                    ctx.fillText(text, centerX, centerY);
                }
                
                // Draw values on each slice
                const data = chart.data.datasets[0].data;
                const meta = chart.getDatasetMeta(0);
                
                ctx.font = `bold 12px sans-serif`;
                ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                ctx.textBaseline = 'middle';
                ctx.textAlign = 'center';
                
                meta.data.forEach((element, index: number) => {
                    const { x, y } = element.tooltipPosition(false);
                    const value = data[index];
                    
                    if (value && x != null && y != null) {
                        ctx.fillText(value.toString(), x, y);
                    }
                });
                
                ctx.save();
            } else if (type === 'bar' || type === 'line') {
                // Draw values on top of each bar or line point
                const data = chart.data.datasets[0].data;
                const meta = chart.getDatasetMeta(0);
                
                ctx.font = `bold 12px sans-serif`;
                ctx.fillStyle = 'rgba(117, 114, 114, 0.8)';
                ctx.textBaseline = 'bottom';
                ctx.textAlign = 'center';
                
                meta.data.forEach((element, index: number) => {
                    const value = data[index];
                    
                    if (value) {
                        const x = element.x;
                        const y = element.y;
                        ctx.fillText(value.toString(), x, y - 5);
                    }
                });
                
                ctx.save();
            }
        }
    }), [totalCount]);

    const options = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: chartType !== 'bar' && chartType !== 'line',
                position: 'top' as const,
                align: 'start' as const,
                labels: {
                    font: {
                        size: 16,
                        weight: 'bold' as const
                    },
                    color: 'rgba(0, 0, 0, 0.87)',
                    padding: 15,
                    usePointStyle: true,
                    pointStyle: 'circle'
                }
            },
            title: {
                display: false,
                text: 'Status',
            },
        },
        scales: (chartType === 'bar' || chartType === 'line') ? {
            y: {
                beginAtZero: true,
                max: Math.ceil(maxValue * 1.1),
                ticks: {
                    color: 'rgba(0, 0, 0, 0.87)',
                    font: {
                        size: 14,
                        weight: 'bold' as const
                    }
                },
                grid: {
                    color: 'rgba(0, 0, 0, 0.1)'
                }
            },
            x: {
                grid: {
                    display: false
                },
                ticks: {
                    color: 'rgba(0, 0, 0, 0.87)',
                    font: {
                        size: 14,
                        weight: 'bold' as const
                    }
                }
            }
        } : undefined,
    }), [chartType, maxValue]);

    return (
        <div className="circulars-chart-container">
            <div className="chart-header">
                <h4 style={{margin: 0}}>{getChartTitle()}</h4>
                <SelectButton 
                    value={chartType} 
                    options={chartTypeOptions} 
                    onChange={(e) => setChartType(e.value)}
                    optionValue="value"
                    itemTemplate={(option) => <i className={option.icon} title={option.label}></i>}
                />
            </div>
            {loading ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                    <i className="pi pi-spin pi-spinner" style={{ fontSize: '2rem' }}></i>
                </div>
            ) : (chartData && totalCount > 0 ) ? (
                <div style={{ height: chartType === 'bar' || chartType === 'line' ? '400px' : '350px' }}>
                    <Chart type={chartType as 'doughnut' | 'pie' | 'bar' | 'line' | 'polarArea'} data={chartData} options={options} plugins={[centerTextPlugin]} />
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: '2rem' }}>No data available</div>
            )}
        </div>
    );
};

export default CircularsChart;