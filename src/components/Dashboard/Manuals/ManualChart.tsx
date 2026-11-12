import { Chart } from 'primereact/chart';
import { useEffect, useState } from 'react';
import { useTheme } from '../../../contexts/ThemeContext';
import type { TooltipItem } from 'chart.js';

interface ChartProps {
    newCnt : number ;
    toApprovalCnt: number;
    releasedCnt: number;
    toAckCnt: number;
    totalDocuments: number;
}

const ManualChart: React.FC<ChartProps> = ({ newCnt, toApprovalCnt, releasedCnt, toAckCnt, totalDocuments }) => {
    const { theme } = useTheme();
    const [chartColors, setChartColors] = useState({
        textColor: 'white',
        gridColor: 'rgba(200, 200, 200, 0.2)'
    });

    useEffect(() => {
        const root = document.documentElement;
        const computedTextColor = getComputedStyle(root).getPropertyValue('--text-secondary').trim();
        const computedGridColor = getComputedStyle(root).getPropertyValue('--border-color').trim();
        
        setChartColors({
            textColor: computedTextColor,
            gridColor: computedGridColor || (theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)')
        });
    }, [theme]);

    const barChartData = {
        labels: ['New Documents', 'Pending Approval', 'Released', 'To Acknowledge'],
        datasets: [
            {
                label: 'Document Count',
                data: [newCnt, toApprovalCnt, releasedCnt, toAckCnt],
                // One colour: the bars differ by category, not by meaning.
                backgroundColor: 'rgba(0, 114, 188, 0.85)',
                hoverBackgroundColor: '#0072bc',
                borderWidth: 0,
                maxBarThickness: 64,
                borderRadius: 6,
                borderSkipped: false,
            }
        ]
    };

    const barChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false,
            },
            tooltip: {
                backgroundColor: theme === 'dark' ? '#1f2937' : '#2c3e50',
                titleColor: '#ffffff',
                bodyColor: '#e0e0e0',
                borderColor: chartColors.textColor,
                borderWidth: 1,
                cornerRadius: 8,
                callbacks: {
                    label: function(context: TooltipItem<'bar'>) {
                        const label = context.label || '';
                        const value = context.parsed.y || 0;
                        const total = totalDocuments;
                        const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                        return `${label}: ${value} (${percentage}%)`;
                    }
                }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                max: Math.max(totalDocuments * 1.2, Math.max(newCnt, toApprovalCnt, releasedCnt, toAckCnt) * 1.3),
                grid: {
                    color: chartColors.gridColor,
                    drawBorder: false
                },
                ticks: {
                    color: chartColors.textColor,
                    font: {
                        size: 12
                    },
                    stepSize: Math.ceil(totalDocuments / 10) || 1,
                    callback: function(value: string | number) {
                        return Number.isInteger(value) ? value : '';
                    }
                },
                title: {
                    display: false,
                    text: `Total Documents: ${totalDocuments}`,
                    color: chartColors.textColor,
                    font: {
                        size: 14,
                        weight: 'bold'
                    }
                }
            },
            x: {
                grid: {
                    display: false,
                    color: chartColors.gridColor
                },
                ticks: {
                    color: chartColors.textColor,
                    font: {
                        size: 12,
                        weight: '500'
                    },
                    maxRotation: 45,
                    minRotation: 0
                }
            }
        },
        animation: {
            duration: 1000,
            easing: 'easeInOutQuart'
        }
    };

    return (
        <div className="dashboard-card chart-card">
            <div className="card-header">
                <h3>Document Status Overview</h3>
            </div>
            <div className="chart-container">
                <Chart type="bar" data={barChartData} options={barChartOptions} />                
            </div>
        </div>
    );
}

export default ManualChart;