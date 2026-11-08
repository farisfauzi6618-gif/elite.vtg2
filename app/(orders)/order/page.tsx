import OrderForm from "@/app/(orders)/order/order-form";
export default async function Home({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams;
 // Presentation only. Selection, prices and stock are still validated by the API.
 return <OrderForm initialCatalogPending={typeof params.catalog==='string'&&!!params.catalog}/>;
}
