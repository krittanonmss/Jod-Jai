import type {Metadata} from 'next';
import './style.css';
export const metadata:Metadata={title:'Jod-Jai | จดรายจ่าย ให้เบาใจ',description:'ส่งสลิปผ่าน LINE เติมรายละเอียด แล้วตรวจสอบก่อนบันทึกรายจ่าย'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="th"><body>{children}</body></html>;}
